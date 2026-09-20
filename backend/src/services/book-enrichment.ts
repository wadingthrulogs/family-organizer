import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Book lookups for the guest display's reading list.
 *
 * Same shape as recipe-photo extraction (see routes/inventory.ts and
 * tools/recipe-image-watcher): the app never runs AI and never holds a model
 * key. It writes `<bookId>.book.json` into the host-bridge upload dir; the
 * watcher runs headless Claude on the subscription, looks the book up, downloads
 * the cover, and writes `<bookId>.book.result.json` (+ `<bookId>.cover.<ext>`)
 * to the output dir. `ingestBookLookups()` folds results back into the
 * `guest_books` HouseholdSetting row and files the cover as an Attachment.
 *
 * Unlike recipes this is asynchronous: saving a book returns immediately and
 * the result lands a minute or so later. Ingest runs on a ticker and on every
 * GET /guest/content so the UI catches up as soon as someone looks.
 */

const BOOKS_KEY = 'guest_books';
const UPLOADS_DIR = path.resolve('uploads');
const RESULT_SUFFIX = '.book.result.json';
const REQUEST_SUFFIX = '.book.json';
/** A pending lookup with no result after this long is marked failed. */
const PENDING_TIMEOUT_MS = 15 * 60_000;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export type EnrichStatus = 'pending' | 'done' | 'failed';

export interface StoredBook {
  id: string;
  title: string;
  author: string;
  reader: string;
  progress: number | null;
  coverAttachmentId: number | null;
  synopsis: string;
  year: number | null;
  enrichStatus: EnrichStatus | null;
  enrichError: string | null;
  enrichRequestedAt: string | null;
  enrichedAt: string | null;
}

interface LookupResult {
  ok?: boolean;
  error?: string | null;
  title?: string | null;
  author?: string | null;
  year?: number | null;
  synopsis?: string | null;
  coverFile?: string | null;
}

function dirs(): { uploadDir: string; outputDir: string } | null {
  const uploadDir = process.env.RECIPE_EXTRACT_UPLOAD_DIR;
  const outputDir = process.env.RECIPE_EXTRACT_OUTPUT_DIR;
  if (!uploadDir || !outputDir) return null;
  return { uploadDir, outputDir };
}

/** True when the host bridge is configured, i.e. lookups can happen at all. */
export function bookLookupEnabled(): boolean {
  return dirs() !== null;
}

function safeId(id: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(id);
}

function unlinkQuiet(p: string) {
  try { fs.unlinkSync(p); } catch { /* already gone */ }
}

/** Write the request file the watcher picks up. Atomic (write + rename). */
export function queueBookLookup(book: Pick<StoredBook, 'id' | 'title' | 'author'>): boolean {
  const d = dirs();
  if (!d || !safeId(book.id)) return false;
  try {
    const finalPath = path.join(d.uploadDir, `${book.id}${REQUEST_SUFFIX}`);
    const partPath = `${finalPath}.part`;
    fs.writeFileSync(partPath, JSON.stringify({ id: book.id, title: book.title, author: book.author }));
    fs.renameSync(partPath, finalPath);
    return true;
  } catch (err) {
    logger.warn('book lookup: could not queue request', { id: book.id, err: String(err) });
    return false;
  }
}

async function readBooks(): Promise<StoredBook[]> {
  const row = await prisma.householdSetting.findUnique({ where: { key: BOOKS_KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as StoredBook[]) : [];
  } catch {
    return [];
  }
}

async function writeBooks(books: StoredBook[]) {
  const value = JSON.stringify(books);
  await prisma.householdSetting.upsert({ where: { key: BOOKS_KEY }, create: { key: BOOKS_KEY, value }, update: { value } });
}

const IMAGE_MAGIC: { ext: string; mime: string; bytes: number[] }[] = [
  { ext: '.jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: '.png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: '.webp', mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

/** Copy a watcher-fetched cover into the uploads volume and file an Attachment. */
async function fileCover(coverPath: string, title: string): Promise<number | null> {
  let buf: Buffer;
  try {
    const stat = fs.statSync(coverPath);
    if (stat.size === 0 || stat.size > MAX_COVER_BYTES) return null;
    buf = fs.readFileSync(coverPath);
  } catch {
    return null;
  }
  const kind = IMAGE_MAGIC.find((m) => m.bytes.every((b, i) => buf[i] === b));
  if (!kind) return null;

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}${kind.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buf);

  const attachment = await prisma.attachment.create({
    data: {
      ownerUserId: null, // household-wide: the display may be signed in as anyone
      fileName: `${title} cover${kind.ext}`,
      filePath: fileName,
      contentType: kind.mime,
      byteSize: buf.length,
      checksum: createHash('sha256').update(buf).digest('hex'),
      linkedEntityType: 'guestBook',
    },
  });
  return attachment.id;
}

async function removeAttachment(id: number) {
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return;
  unlinkQuiet(path.join(UPLOADS_DIR, att.filePath));
  await prisma.attachment.delete({ where: { id } }).catch(() => {});
}

let ingesting = false;

/**
 * Fold any finished lookups into the book list and mark stale ones failed.
 * Returns true if anything changed. Safe to call often; it's a directory scan.
 */
export async function ingestBookLookups(): Promise<boolean> {
  const d = dirs();
  if (!d || ingesting) return false;
  ingesting = true;
  try {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(d.outputDir).filter((f) => f.endsWith(RESULT_SUFFIX));
    } catch {
      return false;
    }

    const books = await readBooks();
    const now = Date.now();
    let changed = false;

    for (const file of entries) {
      const id = file.slice(0, -RESULT_SUFFIX.length);
      const resultPath = path.join(d.outputDir, file);
      const cleanup = (coverFile?: string | null) => {
        unlinkQuiet(resultPath);
        unlinkQuiet(path.join(d.uploadDir, `${id}${REQUEST_SUFFIX}`));
        unlinkQuiet(path.join(d.outputDir, `${id}.book.claude.json`));
        unlinkQuiet(path.join(d.outputDir, `${id}.book.claude.raw.txt`));
        if (coverFile) unlinkQuiet(path.join(d.outputDir, path.basename(coverFile)));
      };

      if (!safeId(id)) { cleanup(); continue; }

      let result: LookupResult;
      try {
        result = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as LookupResult;
      } catch {
        cleanup();
        continue;
      }

      const book = books.find((b) => b.id === id);
      if (!book) { cleanup(result.coverFile); continue; }
      // Books saved before lookups existed lack these fields entirely.
      book.author ??= '';
      book.synopsis ??= '';

      if (result.ok === false || result.error) {
        book.enrichStatus = 'failed';
        book.enrichError = String(result.error ?? 'Lookup failed').slice(0, 300);
        logger.info('book lookup failed', { id, title: book.title, error: book.enrichError });
      } else {
        if (!book.author.trim() && result.author) book.author = String(result.author).slice(0, 200);
        if (!book.synopsis.trim() && result.synopsis) book.synopsis = String(result.synopsis).slice(0, 2000);
        if (typeof result.year === 'number' && Number.isFinite(result.year)) book.year = Math.round(result.year);

        if (result.coverFile) {
          const coverPath = path.join(d.outputDir, path.basename(result.coverFile));
          const coverId = await fileCover(coverPath, book.title);
          if (coverId !== null) {
            if (book.coverAttachmentId) await removeAttachment(book.coverAttachmentId);
            book.coverAttachmentId = coverId;
          }
        }
        book.enrichStatus = 'done';
        book.enrichError = null;
        book.enrichedAt = new Date(now).toISOString();
        logger.info('book lookup done', { id, title: book.title, cover: Boolean(book.coverAttachmentId) });
      }
      changed = true;
      cleanup(result.coverFile);
    }

    for (const book of books) {
      if (book.enrichStatus === 'pending' && book.enrichRequestedAt) {
        const age = now - Date.parse(book.enrichRequestedAt);
        if (Number.isFinite(age) && age > PENDING_TIMEOUT_MS) {
          book.enrichStatus = 'failed';
          book.enrichError = 'Timed out waiting for the lookup service';
          unlinkQuiet(path.join(d.uploadDir, `${book.id}${REQUEST_SUFFIX}`));
          changed = true;
        }
      }
    }

    if (changed) await writeBooks(books);
    return changed;
  } catch (err) {
    logger.warn('book lookup ingest failed', { err: String(err) });
    return false;
  } finally {
    ingesting = false;
  }
}

let ticker: NodeJS.Timeout | null = null;

export function startBookLookupTicker(intervalMs = 60_000) {
  if (!bookLookupEnabled() || ticker) return;
  ticker = setInterval(() => { void ingestBookLookups(); }, intervalMs);
  logger.info('book lookup ingest ticker started', { intervalMs });
}

export function stopBookLookupTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}
