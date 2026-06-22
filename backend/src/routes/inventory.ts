import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { Prisma } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { parseBulkLine } from '../utils/parse-bulk-line.js';
import { upsertPreparedMealRecipe, deletePreparedMealRecipe } from '../services/prepared-meal.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_MIME_EXTENSION,
  verifyImageMagicBytes,
} from '../utils/image-magic.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

/* ─── Schemas ─── */

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  lowStock: z.string().optional().transform((val) => val === 'true'),
});

const createItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).nullable().optional(),
  quantity: z.coerce.number().min(0).max(99_999).default(1),
  unit: z.string().trim().max(24).nullable().optional(),
  pantryItemKey: z.string().trim().max(120).nullable().optional(),
  lowStockThreshold: z.coerce.number().min(0).max(99_999).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isPreparedMeal: z.boolean().optional(),
  dateAdded: z.coerce.date().nullable().optional(),
});

const updateItemSchema = createItemSchema.partial();

const itemIdSchema = z.object({
  itemId: z.coerce.number().int().positive(),
});

const fromGrocerySchema = z.object({
  groceryItemId: z.coerce.number().int().positive(),
  groceryListId: z.coerce.number().int().positive(),
});

const fromGroceryListSchema = z.object({
  groceryListId: z.coerce.number().int().positive(),
});

/* ─── Routes ─── */

// List all inventory items
inventoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, category, lowStock } = listQuerySchema.parse(req.query);

    const where: Prisma.InventoryItemWhereInput = {};
    if (search) {
      where.name = { contains: search };
    }
    if (category) {
      where.category = category;
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const filtered = lowStock
      ? items.filter(
          (item) =>
            item.lowStockThreshold !== null &&
            item.quantity <= item.lowStockThreshold
        )
      : items;

    res.json({ items: filtered, total: filtered.length });
  })
);

// Export inventory as plain text file
inventoryRouter.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];

    lines.push(`INVENTORY EXPORT — ${today}`);
    lines.push('================================================');
    lines.push('');

    if (items.length === 0) {
      lines.push('No items in inventory.');
    } else {
      // Group items by category
      const groups = new Map<string, typeof items>();
      for (const item of items) {
        const key = item.category || 'Uncategorized';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      for (const [category, groupItems] of groups) {
        const label = `── ${category} `;
        lines.push(label + '─'.repeat(Math.max(0, 48 - label.length)));

        for (const item of groupItems) {
          const qty = item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
          let line = `  ${item.name.padEnd(24)} ${qty.padEnd(12)}`;

          const extras: string[] = [];
          if (item.lowStockThreshold != null) {
            const warning = item.quantity <= item.lowStockThreshold ? ' ⚠ LOW' : '';
            extras.push(`low stock threshold: ${item.lowStockThreshold}${warning}`);
          }
          if (item.notes) extras.push(`Notes: ${item.notes}`);
          if (item.dateAdded) extras.push(`Added: ${item.dateAdded.toISOString().slice(0, 10)}`);

          if (extras.length > 0) line += `(${extras.join(' | ')})`;
          lines.push(line);
        }

        lines.push('');
      }

      lines.push('================================================');
      lines.push(`Total: ${items.length} item${items.length === 1 ? '' : 's'} across ${groups.size} categor${groups.size === 1 ? 'y' : 'ies'}`);
    }

    lines.push('');

    const text = lines.join('\n');
    const filename = `inventory-${today}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(text);
  })
);

// Get single inventory item
inventoryRouter.get(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const { itemId } = itemIdSchema.parse(req.params);
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });

    if (!item) {
      return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' } });
    }

    res.json(item);
  })
);

// ----- Bulk add: parse natural-language lines into inventory items -----

const bulkAddSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

inventoryRouter.post(
  '/bulk',
  asyncHandler(async (req, res) => {
    const { text } = bulkAddSchema.parse(req.body ?? {});

    const lines = text.split('\n');
    const parsed = lines
      .map(parseBulkLine)
      .filter((item) => item.name.length > 0);

    if (parsed.length === 0) {
      return res.status(400).json({ error: { code: 'NO_ITEMS', message: 'No valid items found in input' } });
    }

    const items = await prisma.$transaction(
      parsed.map((item) =>
        prisma.inventoryItem.create({
          data: {
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            dateAdded: new Date(),
          },
        })
      )
    );

    res.status(201).json({ items, total: items.length });
  })
);

// ----- Recipe photo → inventory (bridged to the host Claude Code watcher) -----
//
// The app never runs AI or holds an API key. It drops the uploaded image into a
// host directory watched by the subscription-billed `recipe-image-watcher`
// service, then reads back the JSON that service writes.

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function extractionConfig() {
  const uploadDir = process.env.RECIPE_EXTRACT_UPLOAD_DIR;
  const outputDir = process.env.RECIPE_EXTRACT_OUTPUT_DIR;
  const timeoutMs = Number(process.env.RECIPE_EXTRACT_TIMEOUT_MS) || 75_000;
  return { uploadDir, outputDir, timeoutMs, enabled: Boolean(uploadDir && outputDir) };
}

function requireExtractionConfigured(_req: Request, res: Response, next: NextFunction) {
  if (!extractionConfig().enabled) {
    return res.status(501).json({
      error: { code: 'EXTRACTION_NOT_CONFIGURED', message: 'Recipe photo extraction is not configured on this server.' },
    });
  }
  next();
}

// Saves the upload as "<uuid>.part" in the watch dir — a non-image extension the
// watcher ignores — so it only processes the complete image after we rename it.
const recipeUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, extractionConfig().uploadDir as string),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.part`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)),
});

// Analyze a recipe photo and return the extracted items for an editable preview.
inventoryRouter.post(
  '/extract-from-image',
  requireExtractionConfigured,
  recipeUpload.single('image'),
  asyncHandler(async (req, res) => {
    const { uploadDir, outputDir, timeoutMs } = extractionConfig();
    const file = req.file;
    if (!file) {
      return res.status(415).json({ error: { code: 'INVALID_IMAGE', message: 'Upload a JPG, PNG, or WebP image.' } });
    }

    const partPath = file.path;
    if (!verifyImageMagicBytes(partPath, file.mimetype)) {
      fs.rmSync(partPath, { force: true });
      return res.status(415).json({ error: { code: 'INVALID_IMAGE', message: 'That file is not a valid image.' } });
    }

    const ext = IMAGE_MIME_EXTENSION[file.mimetype] ?? 'jpg';
    const imageName = `${path.basename(partPath, '.part')}.${ext}`;
    const imagePath = path.join(uploadDir as string, imageName);

    // Sidecar that teaches the watcher our existing labels so it categorizes the
    // way we already do. Written before the rename so it's present when the
    // watcher processes the image.
    const ctxPath = `${imagePath}.ctx.json`;
    try {
      const rows = await prisma.inventoryItem.findMany({
        where: { category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      });
      const categories = rows.map((r) => r.category).filter((c): c is string => Boolean(c && c.trim()));
      fs.writeFileSync(ctxPath, JSON.stringify({ categories }));
    } catch {
      // Non-fatal: extraction still works without the category hint.
    }

    // Atomic rename within the watch dir → fires the watcher's `moved_to` event.
    fs.renameSync(partPath, imagePath);

    const outPath = path.join(outputDir as string, `${imageName}.json`);
    const rawPath = path.join(outputDir as string, `${imageName}.raw.txt`);
    const cleanup = () => {
      for (const p of [imagePath, outPath, rawPath, ctxPath]) fs.rmSync(p, { force: true });
    };

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(outPath)) {
        let parsed: { title?: unknown; items?: unknown };
        try {
          parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        } catch {
          cleanup();
          return res.status(422).json({ error: { code: 'EXTRACTION_PARSE_FAILED', message: 'Could not read the analysis result.' } });
        }
        cleanup();
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        const items = rawItems
          .filter((it): it is Record<string, unknown> => Boolean(it) && typeof (it as Record<string, unknown>).name === 'string' && String((it as Record<string, unknown>).name).trim() !== '')
          .map((it) => {
            const q = it.quantity;
            return {
              name: String(it.name).trim().slice(0, 200),
              quantity: typeof q === 'number' && Number.isFinite(q) ? q : null,
              unit: it.unit ? String(it.unit).trim().slice(0, 24) : null,
              category: it.category ? String(it.category).trim().slice(0, 120) : null,
            };
          });
        return res.json({ title: typeof parsed.title === 'string' ? parsed.title : null, items });
      }
      if (fs.existsSync(rawPath)) {
        cleanup();
        return res.status(422).json({ error: { code: 'EXTRACTION_PARSE_FAILED', message: 'The analyzer did not return usable data. Try a clearer photo.' } });
      }
      await sleep(1000);
    }

    cleanup();
    return res.status(504).json({ error: { code: 'EXTRACTION_TIMEOUT', message: 'Analysis took too long. Please try again.' } });
  })
);

// Commit reviewed/edited items from the preview into inventory.
const bulkItemsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().min(0).max(99_999).nullable().optional(),
        unit: z.string().trim().max(24).nullable().optional(),
        category: z.string().trim().max(120).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

inventoryRouter.post(
  '/bulk-items',
  asyncHandler(async (req, res) => {
    const { items } = bulkItemsSchema.parse(req.body ?? {});
    const created = await prisma.$transaction(
      items.map((it) =>
        prisma.inventoryItem.create({
          data: {
            name: it.name,
            quantity: it.quantity ?? 1,
            unit: it.unit ?? null,
            category: it.category ?? null,
            dateAdded: new Date(),
          },
        })
      )
    );
    res.status(201).json({ items: created, total: created.length });
  })
);

// Create inventory item
inventoryRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = createItemSchema.parse(req.body ?? {});

    const item = await prisma.inventoryItem.create({
      data: {
        name: payload.name,
        category: payload.category ?? null,
        quantity: payload.quantity,
        unit: payload.unit ?? null,
        pantryItemKey: payload.pantryItemKey ?? null,
        lowStockThreshold: payload.lowStockThreshold ?? null,
        notes: payload.notes ?? null,
        isPreparedMeal: payload.isPreparedMeal ?? false,
        dateAdded: payload.dateAdded ?? new Date(),
      },
    });

    if (item.isPreparedMeal) {
      await upsertPreparedMealRecipe(item, req.session.userId!);
    }

    res.status(201).json(item);
  })
);

// Update inventory item
inventoryRouter.patch(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const { itemId } = itemIdSchema.parse(req.params);
    const payload = updateItemSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' } });
    }

    const data: Prisma.InventoryItemUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.category !== undefined) data.category = payload.category ?? null;
    if (payload.quantity !== undefined) data.quantity = payload.quantity;
    if (payload.unit !== undefined) data.unit = payload.unit ?? null;
    if (payload.pantryItemKey !== undefined) data.pantryItemKey = payload.pantryItemKey ?? null;
    if (payload.lowStockThreshold !== undefined) data.lowStockThreshold = payload.lowStockThreshold ?? null;
    if (payload.notes !== undefined) data.notes = payload.notes ?? null;
    if (payload.isPreparedMeal !== undefined) data.isPreparedMeal = payload.isPreparedMeal;
    if (payload.dateAdded !== undefined) data.dateAdded = payload.dateAdded ?? new Date();

    const updated = await prisma.inventoryItem.update({ where: { id: itemId }, data });

    // Keep the linked prepared-meal recipe in sync (create / update title+unit+notes / remove).
    if (updated.isPreparedMeal) {
      await upsertPreparedMealRecipe(updated, req.session.userId!);
    } else if (existing.isPreparedMeal) {
      await deletePreparedMealRecipe(updated.id);
    }

    res.json(updated);
  })
);

// Delete inventory item
inventoryRouter.delete(
  '/:itemId',
  asyncHandler(async (req, res) => {
    const { itemId } = itemIdSchema.parse(req.params);

    try {
      await prisma.inventoryItem.delete({ where: { id: itemId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Inventory item not found' } });
      }
      throw err;
    }
  })
);

// Move a grocery item to inventory (upsert by pantryItemKey or name)
inventoryRouter.post(
  '/from-grocery',
  asyncHandler(async (req, res) => {
    const { groceryItemId, groceryListId } = fromGrocerySchema.parse(req.body ?? {});

    const groceryItem = await prisma.groceryItem.findUnique({ where: { id: groceryItemId } });

    if (!groceryItem || groceryItem.listId !== groceryListId) {
      return res.status(404).json({ error: { code: 'GROCERY_ITEM_NOT_FOUND', message: 'Grocery item not found' } });
    }

    // Prevent moving the same item twice
    if (groceryItem.movedToInventoryAt) {
      return res.status(409).json({ error: { code: 'ALREADY_MOVED', message: 'This item has already been moved to inventory' } });
    }

    const inventoryItem = await upsertInventoryFromGrocery(groceryItem);

    // Mark the grocery item as PURCHASED and record move timestamp
    await prisma.groceryItem.update({
      where: { id: groceryItemId },
      data: { state: 'PURCHASED', movedToInventoryAt: new Date() },
    });

    res.status(201).json(inventoryItem);
  })
);

// Move all purchased items from a grocery list to inventory at once
inventoryRouter.post(
  '/from-grocery-list',
  asyncHandler(async (req, res) => {
    const { groceryListId } = fromGroceryListSchema.parse(req.body ?? {});

    const list = await prisma.groceryList.findUnique({ where: { id: groceryListId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
    }

    // Get all purchased items that haven't been moved yet
    const eligibleItems = await prisma.groceryItem.findMany({
      where: {
        listId: groceryListId,
        state: 'PURCHASED',
        movedToInventoryAt: null,
      },
    });

    if (eligibleItems.length === 0) {
      return res.json({ moved: 0, items: [] });
    }

    const inventoryItems = [];
    for (const groceryItem of eligibleItems) {
      const inventoryItem = await upsertInventoryFromGrocery(groceryItem);
      inventoryItems.push(inventoryItem);

      await prisma.groceryItem.update({
        where: { id: groceryItem.id },
        data: { movedToInventoryAt: new Date() },
      });
    }

    res.status(201).json({ moved: inventoryItems.length, items: inventoryItems });
  })
);

/* ─── Helpers ─── */

async function upsertInventoryFromGrocery(groceryItem: {
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  pantryItemKey: string | null;
  notes: string | null;
}) {
  const matchKey = groceryItem.pantryItemKey || groceryItem.name.toLowerCase().trim();

  // Try to find existing inventory item
  let existing = groceryItem.pantryItemKey
    ? await prisma.inventoryItem.findUnique({ where: { pantryItemKey: groceryItem.pantryItemKey } })
    : await prisma.inventoryItem.findFirst({ where: { name: { equals: groceryItem.name } } });

  if (existing) {
    return prisma.inventoryItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + groceryItem.quantity },
    });
  }

  return prisma.inventoryItem.create({
    data: {
      name: groceryItem.name,
      category: groceryItem.category,
      quantity: groceryItem.quantity,
      unit: groceryItem.unit,
      pantryItemKey: groceryItem.pantryItemKey || matchKey,
      notes: groceryItem.notes,
      dateAdded: new Date(),
    },
  });
}
