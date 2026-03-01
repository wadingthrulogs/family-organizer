import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { parseBulkLine } from '../utils/parse-bulk-line.js';

export const groceryRouter = Router();
groceryRouter.use(requireAuth);

const GROCERY_STATES = ['NEEDED', 'CLAIMED', 'IN_CART', 'PURCHASED'] as const;

const listQuerySchema = z.object({
  includeItems: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

const createListSchema = z.object({
  name: z.string().trim().min(1).max(120),
  store: z.string().trim().max(120).nullable().optional(),
  presetKey: z.string().trim().max(120).nullable().optional(),
  isActive: z.coerce.boolean().default(true),
});

const updateListSchema = createListSchema.partial();

const listIdSchema = z.object({
  listId: z.coerce.number().int().positive(),
});

const createItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).nullable().optional(),
  quantity: z.coerce.number().min(0.1).max(999).default(1),
  unit: z.string().trim().max(24).nullable().optional(),
  state: z.enum(GROCERY_STATES).default('NEEDED'),
  assigneeUserId: z.coerce.number().int().positive().nullable().optional(),
  claimedByUserId: z.coerce.number().int().positive().nullable().optional(),
  pantryItemKey: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const updateItemSchema = createItemSchema.partial();

const itemParamsSchema = z.object({
  listId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

groceryRouter.get(
  '/lists',
  asyncHandler(async (req, res) => {
    const { includeItems, active } = listQuerySchema.parse(req.query);
    const where = typeof active === 'boolean' ? { isActive: active } : undefined;

    const [items, total] = await Promise.all([
      prisma.groceryList.findMany({
        where,
        include: includeItems ? { items: { orderBy: { sortOrder: 'asc' } } } : undefined,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.groceryList.count({ where }),
    ]);

    res.json({ items, total });
  })
);

groceryRouter.post(
  '/lists',
  asyncHandler(async (req, res) => {
    const payload = createListSchema.parse(req.body ?? {});
    const list = await prisma.groceryList.create({ data: payload });
    res.status(201).json(list);
  })
);

groceryRouter.patch(
  '/lists/:listId',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);
    const payload = updateListSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const data: Prisma.GroceryListUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.store !== undefined) data.store = payload.store ?? null;
    if (payload.presetKey !== undefined) data.presetKey = payload.presetKey ?? null;
    if (payload.isActive !== undefined) data.isActive = payload.isActive;

    try {
      const updated = await prisma.groceryList.update({ where: { id: listId }, data });
      res.json(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
      }
      throw err;
    }
  })
);

groceryRouter.delete(
  '/lists/:listId',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);

    try {
      await prisma.groceryList.delete({ where: { id: listId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
      }
      throw err;
    }
  })
);

groceryRouter.get(
  '/lists/:listId/items',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);

    const items = await prisma.groceryItem.findMany({
      where: { listId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ items, total: items.length });
  })
);

groceryRouter.post(
  '/lists/:listId/items',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);
    const payload = createItemSchema.parse(req.body ?? {});

    const item = await prisma.groceryItem.create({
      data: {
        listId,
        name: payload.name,
        category: payload.category ?? null,
        quantity: payload.quantity,
        unit: payload.unit ?? null,
        state: payload.state,
        assigneeUserId: payload.assigneeUserId ?? null,
        claimedByUserId: payload.claimedByUserId ?? null,
        pantryItemKey: payload.pantryItemKey ?? null,
        sortOrder: payload.sortOrder ?? null,
        notes: payload.notes ?? null,
      },
    });

    res.status(201).json(item);
  })
);

// ----- Bulk add: parse natural-language lines into grocery items -----

const bulkAddSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

groceryRouter.post(
  '/lists/:listId/items/bulk',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);
    const { text } = bulkAddSchema.parse(req.body ?? {});

    // Check list exists
    const list = await prisma.groceryList.findUnique({ where: { id: listId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
    }

    const lines = text.split('\n');
    const parsed = lines
      .map(parseBulkLine)
      .filter((item) => item.name.length > 0);

    if (parsed.length === 0) {
      return res.status(400).json({ error: { code: 'NO_ITEMS', message: 'No valid items found in input' } });
    }

    const items = await prisma.$transaction(
      parsed.map((item) =>
        prisma.groceryItem.create({
          data: {
            listId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            state: 'NEEDED',
          },
        })
      )
    );

    res.status(201).json({ items, total: items.length });
  })
);

// Add all low-stock inventory items to a grocery list
groceryRouter.post(
  '/lists/:listId/items/from-low-stock',
  asyncHandler(async (req, res) => {
    const { listId } = listIdSchema.parse(req.params);

    const list = await prisma.groceryList.findUnique({ where: { id: listId } });
    if (!list) {
      return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
    }

    // Get all inventory items that are at or below their low-stock threshold
    const allItems = await prisma.inventoryItem.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const lowStockItems = allItems.filter(
      (item) => item.lowStockThreshold !== null && item.quantity <= item.lowStockThreshold
    );

    if (lowStockItems.length === 0) {
      return res.json({ items: [], total: 0 });
    }

    // Avoid duplicates — skip items already on this list
    const existingItems = await prisma.groceryItem.findMany({
      where: { listId },
      select: { name: true },
    });
    const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase()));
    const toAdd = lowStockItems.filter((i) => !existingNames.has(i.name.toLowerCase()));

    if (toAdd.length === 0) {
      return res.json({ items: [], total: 0, message: 'All low-stock items are already on this list' });
    }

    const items = await prisma.$transaction(
      toAdd.map((inv) =>
        prisma.groceryItem.create({
          data: {
            listId,
            name: inv.name,
            category: inv.category,
            quantity: 1,
            unit: inv.unit,
            state: 'NEEDED',
            pantryItemKey: inv.pantryItemKey,
          },
        })
      )
    );

    res.status(201).json({ items, total: items.length });
  })
);

groceryRouter.patch(
  '/lists/:listId/items/:itemId',
  asyncHandler(async (req, res) => {
    const { listId, itemId } = itemParamsSchema.parse(req.params);
    const payload = updateItemSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const existing = await prisma.groceryItem.findUnique({ where: { id: itemId } });

    if (!existing || existing.listId !== listId) {
      return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Grocery item not found' } });
    }

    const data: Prisma.GroceryItemUncheckedUpdateInput = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.category !== undefined) data.category = payload.category ?? null;
    if (payload.quantity !== undefined) data.quantity = payload.quantity;
    if (payload.unit !== undefined) data.unit = payload.unit ?? null;
    if (payload.state !== undefined) data.state = payload.state;
    if (payload.assigneeUserId !== undefined) data.assigneeUserId = payload.assigneeUserId ?? null;
    if (payload.claimedByUserId !== undefined) data.claimedByUserId = payload.claimedByUserId ?? null;
    if (payload.pantryItemKey !== undefined) data.pantryItemKey = payload.pantryItemKey ?? null;
    if (payload.sortOrder !== undefined) data.sortOrder = payload.sortOrder ?? null;
    if (payload.notes !== undefined) data.notes = payload.notes ?? null;

    const updated = await prisma.groceryItem.update({ where: { id: itemId }, data });
    res.json(updated);
  })
);

groceryRouter.delete(
  '/lists/:listId/items/:itemId',
  asyncHandler(async (req, res) => {
    const { listId, itemId } = itemParamsSchema.parse(req.params);

    const existing = await prisma.groceryItem.findUnique({ where: { id: itemId } });

    if (!existing || existing.listId !== listId) {
      return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Grocery item not found' } });
    }

    await prisma.groceryItem.delete({ where: { id: itemId } });
    res.status(204).send();
  })
);
  
