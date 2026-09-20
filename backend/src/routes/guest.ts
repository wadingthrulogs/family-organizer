import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { asyncHandler } from '../utils/async-handler.js';

/**
 * Content for the guest display: things a visitor should see that aren't
 * household data. Small, household-wide, and rarely edited, so they live as
 * JSON values in HouseholdSetting rather than as tables of their own.
 *
 * The Wi-Fi password is encrypted at rest like the other secrets, but unlike
 * them it IS returned to the client — the display has to render it into a QR.
 */

export const guestRouter = Router();

const WIFI_KEY = 'guest_wifi';
const BOOKS_KEY = 'guest_books';

const wifiSchema = z.object({
  ssid: z.string().trim().min(1).max(64),
  security: z.enum(['WPA', 'WEP', 'nopass']).default('WPA'),
  password: z.string().max(128).default(''),
  hidden: z.boolean().default(false),
});

const bookSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).default(''),
  /** Who's reading it — free text so the display can say "Mom" rather than a username. */
  reader: z.string().trim().max(60).default(''),
  /** 0–100 */
  progress: z.number().min(0).max(100).nullable().default(null),
  coverAttachmentId: z.number().int().positive().nullable().default(null),
});

const patchSchema = z.object({
  wifi: wifiSchema.nullable().optional(),
  books: z.array(bookSchema).max(50).optional(),
}).strict();

type Wifi = z.infer<typeof wifiSchema>;
type Book = z.infer<typeof bookSchema> & { id: string };

function decryptField(value: string): string {
  if (!value.startsWith('enc:')) return value;
  try {
    return decryptSecret(Buffer.from(value.slice(4), 'base64'));
  } catch {
    return '';
  }
}

async function readContent(): Promise<{ wifi: Wifi | null; books: Book[] }> {
  const rows = await prisma.householdSetting.findMany({ where: { key: { in: [WIFI_KEY, BOOKS_KEY] } } });
  let wifi: Wifi | null = null;
  let books: Book[] = [];
  for (const row of rows) {
    try {
      if (row.key === WIFI_KEY) {
        const parsed = wifiSchema.parse(JSON.parse(row.value));
        wifi = { ...parsed, password: decryptField(parsed.password) };
      } else if (row.key === BOOKS_KEY) {
        books = z.array(bookSchema).parse(JSON.parse(row.value)).map((b) => ({ ...b, id: b.id ?? randomUUID() }));
      }
    } catch {
      // A corrupt row shouldn't take the display down; treat it as unset.
    }
  }
  return { wifi, books };
}

guestRouter.get(
  '/content',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json(await readContent());
  })
);

guestRouter.patch(
  '/content',
  requireAuth,
  requireRole('ADMIN', 'MEMBER'),
  asyncHandler(async (req, res) => {
    const { wifi, books } = patchSchema.parse(req.body ?? {});

    if (wifi !== undefined) {
      if (wifi === null) {
        await prisma.householdSetting.deleteMany({ where: { key: WIFI_KEY } });
      } else {
        const stored = {
          ...wifi,
          password: wifi.password ? 'enc:' + encryptSecret(wifi.password).toString('base64') : '',
        };
        const value = JSON.stringify(stored);
        await prisma.householdSetting.upsert({ where: { key: WIFI_KEY }, create: { key: WIFI_KEY, value }, update: { value } });
      }
    }

    if (books !== undefined) {
      const value = JSON.stringify(books.map((b) => ({ ...b, id: b.id ?? randomUUID() })));
      await prisma.householdSetting.upsert({ where: { key: BOOKS_KEY }, create: { key: BOOKS_KEY, value }, update: { value } });
    }

    res.json(await readContent());
  })
);
