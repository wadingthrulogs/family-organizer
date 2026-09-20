// Turns Claude's book-lookup answer (already extracted from the envelope by
// parse-envelope.mjs into $CLAUDE_JSON) into the result the app ingests:
//   <id>.book.result.json  { ok, title, author, year, synopsis, coverFile, error }
//   <id>.cover.<ext>       the downloaded cover, if any
//
// The cover download happens here, on the host, so the app container never
// fetches arbitrary URLs. https only, image content-type, size-capped.
// Writes are atomic (tmp + rename) so the app never reads a partial file.
import { writeFileSync, renameSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = process.env.OUTPUT_DIR;
const ID = process.env.BOOK_ID;
const CLAUDE_JSON = process.env.CLAUDE_JSON; // parsed model result, or absent on failure
const FAIL_REASON = process.env.FAIL_REASON; // set by the shell when claude itself failed

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const EXT_BY_TYPE = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function writeResult(result) {
  const finalPath = join(OUTPUT_DIR, `${ID}.book.result.json`);
  const tmp = `${finalPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n');
  renameSync(tmp, finalPath);
  log(`WROTE ${finalPath}`);
}

if (!OUTPUT_DIR || !ID) {
  log('ERROR finish-book: OUTPUT_DIR / BOOK_ID not set');
  process.exit(0);
}

if (FAIL_REASON || !CLAUDE_JSON || !existsSync(CLAUDE_JSON)) {
  writeResult({ ok: false, error: FAIL_REASON || 'No answer from the lookup' });
  process.exit(0);
}

let answer;
try {
  answer = JSON.parse(readFileSync(CLAUDE_JSON, 'utf8'));
} catch (e) {
  writeResult({ ok: false, error: `Lookup answer was not valid JSON: ${e.message}` });
  process.exit(0);
}

if (answer && answer.found === false) {
  writeResult({ ok: false, error: answer.reason ? `Not found: ${String(answer.reason).slice(0, 200)}` : 'Book not found' });
  process.exit(0);
}

const result = {
  ok: true,
  title: typeof answer.title === 'string' ? answer.title.trim() : null,
  author: typeof answer.author === 'string' ? answer.author.trim() : null,
  year: Number.isInteger(answer.year) ? answer.year : null,
  synopsis: typeof answer.synopsis === 'string' ? answer.synopsis.trim() : null,
  coverFile: null,
};

async function fetchCover(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') { log(`SKIP cover: not https (${u.protocol})`); return null; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'family-organizer-book-lookup/1.0' } });
    if (!res.ok) { log(`SKIP cover: HTTP ${res.status}`); return null; }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) { log(`SKIP cover: content-type ${type || 'unknown'}`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) { log(`SKIP cover: ${buf.length} bytes`); return null; }
    // Open Library serves a 1x1 placeholder for unknown ids; treat tiny files as none.
    if (buf.length < 1500) { log(`SKIP cover: too small to be a cover (${buf.length} bytes)`); return null; }
    const name = `${ID}.cover${ext}`;
    const finalPath = join(OUTPUT_DIR, name);
    const tmp = `${finalPath}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, finalPath);
    log(`COVER ${name} (${buf.length} bytes from ${u.hostname})`);
    return name;
  } catch (e) {
    log(`SKIP cover: ${e.name === 'AbortError' ? 'timed out' : e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const candidates = [];
if (typeof answer.coverUrl === 'string') candidates.push(answer.coverUrl);
if (Array.isArray(answer.coverUrls)) candidates.push(...answer.coverUrls.filter((x) => typeof x === 'string'));
for (const url of candidates.slice(0, 3)) {
  result.coverFile = await fetchCover(url);
  if (result.coverFile) break;
}

writeResult(result);
try { unlinkSync(CLAUDE_JSON); } catch { /* keep going */ }
