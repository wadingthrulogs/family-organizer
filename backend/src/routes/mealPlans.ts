import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { parseBulkLine } from '../utils/parse-bulk-line.js';

export const mealPlansRouter = Router();
mealPlansRouter.use(requireAuth);

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

// ─── Zod schemas ────────────────────────────────────────────────────────────

const recipeIdParams = z.object({ recipeId: z.coerce.number().int().positive() });
const planIdParams = z.object({ planId: z.coerce.number().int().positive() });
const entryIdParams = z.object({
  planId: z.coerce.number().int().positive(),
  entryId: z.coerce.number().int().positive(),
});

const createRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  servings: z.coerce.number().int().min(1).max(100).default(1),
  prepMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  cookMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  sourceUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().min(0).optional(),
        unit: z.string().trim().max(30).optional(),
        inventoryItemId: z.coerce.number().int().positive().optional(),
      })
    )
    .default([]),
});

const updateRecipeSchema = createRecipeSchema.partial();

const createPlanSchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
  weekStart: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

const updatePlanSchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
});

const createEntrySchema = z.object({
  recipeId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  mealType: z.enum(MEAL_TYPES),
  dayOffset: z.coerce.number().int().min(0).max(6),
  servings: z.coerce.number().int().min(1).max(100).default(1),
  notes: z.string().trim().max(500).nullable().optional(),
});

const updateEntrySchema = createEntrySchema.partial();

const sendToGrocerySchema = z.object({
  groceryListId: z.coerce.number().int().positive(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Ingredient = { name: string; quantity?: number; unit?: string; inventoryItemId?: number };

function parseIngredients(json: string): Ingredient[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function serializeIngredients(ingredients: Ingredient[]) {
  return JSON.stringify(ingredients);
}

// Shared inventory-check logic (used by both GET check and POST add-missing-to-grocery)
async function checkIngredientsAgainstInventory(
  ingredients: Ingredient[],
  recipeServings: number,
  requestedServings: number
) {
  // Bulk-fetch all inventory items once
  const allInventory = await prisma.inventoryItem.findMany();
  const byId = new Map(allInventory.map((i) => [i.id, i]));
  const byName = new Map(allInventory.map((i) => [i.name.toLowerCase().trim(), i]));

  type Status = 'ok' | 'low' | 'missing' | 'unlinked';
  const results: Array<{
    name: string;
    required?: number;
    unit?: string;
    inStock?: number;
    status: Status;
    inventoryItemId?: number;
    inventoryName?: string;
  }> = [];

  for (const ing of ingredients) {
    const invItem = ing.inventoryItemId
      ? byId.get(ing.inventoryItemId)
      : byName.get(ing.name.toLowerCase().trim());

    const required =
      ing.quantity != null ? Math.round((ing.quantity * (requestedServings / (recipeServings || 1))) * 100) / 100 : undefined;

    if (!invItem) {
      // No inventory item found — check if it's truly missing vs unlinked
      if (ing.inventoryItemId || ing.quantity != null) {
        results.push({ name: ing.name, required, unit: ing.unit, status: 'missing' });
      } else {
        results.push({ name: ing.name, required, unit: ing.unit, status: 'unlinked' });
      }
      continue;
    }

    const inStock = invItem.quantity;
    let status: Status;
    if (required == null || required === 0) {
      status = inStock > 0 ? 'ok' : 'missing';
    } else {
      status = inStock >= required ? 'ok' : 'low';
    }

    results.push({
      name: ing.name,
      required,
      unit: ing.unit ?? invItem.unit ?? undefined,
      inStock,
      status,
      inventoryItemId: invItem.id,
      inventoryName: invItem.name,
    });
  }

  const canMake = results.every((r) => r.status === 'ok' || r.status === 'unlinked');
  return { canMake, results };
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

mealPlansRouter.get(
  '/recipes',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const [items, total] = await Promise.all([
      prisma.recipe.findMany({
        where: { createdByUserId: userId },
        orderBy: { title: 'asc' },
      }),
      prisma.recipe.count({ where: { createdByUserId: userId } }),
    ]);

    res.json({
      items: items.map((r) => ({ ...r, ingredients: parseIngredients(r.ingredientsJson) })),
      total,
    });
  })
);

mealPlansRouter.post(
  '/recipes',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const payload = createRecipeSchema.parse(req.body ?? {});

    const recipe = await prisma.recipe.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        servings: payload.servings,
        prepMinutes: payload.prepMinutes ?? null,
        cookMinutes: payload.cookMinutes ?? null,
        sourceUrl: payload.sourceUrl || null,
        ingredientsJson: serializeIngredients(payload.ingredients),
        createdByUserId: userId,
      },
    });

    res.status(201).json({ ...recipe, ingredients: parseIngredients(recipe.ingredientsJson) });
  })
);

mealPlansRouter.get(
  '/recipes/:recipeId',
  asyncHandler(async (req, res) => {
    const { recipeId } = recipeIdParams.parse(req.params);
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });

    if (!recipe) {
      return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
    }

    res.json({ ...recipe, ingredients: parseIngredients(recipe.ingredientsJson) });
  })
);

mealPlansRouter.patch(
  '/recipes/:recipeId',
  asyncHandler(async (req, res) => {
    const { recipeId } = recipeIdParams.parse(req.params);
    const payload = updateRecipeSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const data: Prisma.RecipeUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description ?? null;
    if (payload.servings !== undefined) data.servings = payload.servings;
    if (payload.prepMinutes !== undefined) data.prepMinutes = payload.prepMinutes ?? null;
    if (payload.cookMinutes !== undefined) data.cookMinutes = payload.cookMinutes ?? null;
    if (payload.sourceUrl !== undefined) data.sourceUrl = payload.sourceUrl || null;
    if (payload.ingredients !== undefined) data.ingredientsJson = serializeIngredients(payload.ingredients);

    try {
      const recipe = await prisma.recipe.update({ where: { id: recipeId }, data });
      res.json({ ...recipe, ingredients: parseIngredients(recipe.ingredientsJson) });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
      }
      throw err;
    }
  })
);

mealPlansRouter.delete(
  '/recipes/:recipeId',
  asyncHandler(async (req, res) => {
    const { recipeId } = recipeIdParams.parse(req.params);
    try {
      await prisma.recipe.delete({ where: { id: recipeId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
      }
      throw err;
    }
  })
);

// ─── Recipe: Bulk Import ──────────────────────────────────────────────────────

const bulkRecipesSchema = z.object({
  text: z.string().trim().min(1).max(20000),
});

mealPlansRouter.post(
  '/recipes/bulk',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const { text } = bulkRecipesSchema.parse(req.body ?? {});

    const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

    const toCreate = blocks.map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const title = lines[0];
      const ingredients = lines.slice(1)
        .map((l) => parseBulkLine(l))
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map(({ name, quantity, unit }) => ({ name, quantity, unit: unit ?? undefined }));
      return { title, ingredients };
    });

    const created = await prisma.$transaction(
      toCreate.map(({ title, ingredients }) =>
        prisma.recipe.create({
          data: {
            title,
            ingredientsJson: serializeIngredients(ingredients),
            createdByUserId: userId,
          },
        })
      )
    );

    res.status(201).json({
      items: created.map((r) => ({ ...r, ingredients: parseIngredients(r.ingredientsJson) })),
      total: created.length,
    });
  })
);

// ─── Recipe: Inventory Check ─────────────────────────────────────────────────

mealPlansRouter.get(
  '/recipes/:recipeId/inventory-check',
  asyncHandler(async (req, res) => {
    const { recipeId } = recipeIdParams.parse(req.params);
    const servingsParam = z.coerce.number().int().min(1).max(100).optional().parse(req.query.servings);

    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
    }

    const ingredients = parseIngredients(recipe.ingredientsJson);
    const requestedServings = servingsParam ?? recipe.servings;
    const { canMake, results } = await checkIngredientsAgainstInventory(ingredients, recipe.servings, requestedServings);

    res.json({ canMake, servings: requestedServings, ingredients: results });
  })
);

// ─── Recipe: Add Missing to Grocery ──────────────────────────────────────────

mealPlansRouter.post(
  '/recipes/:recipeId/add-missing-to-grocery',
  asyncHandler(async (req, res) => {
    const { recipeId } = recipeIdParams.parse(req.params);
    const body = z.object({
      groceryListId: z.coerce.number().int().positive(),
      servings: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.body ?? {});

    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
    }

    const groceryList = await prisma.groceryList.findUnique({ where: { id: body.groceryListId } });
    if (!groceryList) {
      return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
    }

    const ingredients = parseIngredients(recipe.ingredientsJson);
    const requestedServings = body.servings ?? recipe.servings;
    const { results } = await checkIngredientsAgainstInventory(ingredients, recipe.servings, requestedServings);

    // Only add low or missing ingredients
    const needsAdding = results.filter((r) => r.status === 'low' || r.status === 'missing');
    if (needsAdding.length === 0) {
      return res.json({ added: 0, skipped: 0, items: [] });
    }

    // Avoid duplicating items already on the list
    const existingItems = await prisma.groceryItem.findMany({ where: { listId: body.groceryListId } });
    const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase().trim()));
    const toAdd = needsAdding.filter((r) => !existingNames.has(r.name.toLowerCase().trim()));
    const skipped = needsAdding.length - toAdd.length;

    if (toAdd.length === 0) {
      return res.json({ added: 0, skipped, items: [] });
    }

    const items = await prisma.$transaction(
      toAdd.map((r) => {
        // For low: add only the difference; for missing: add the full required amount
        const qty = r.status === 'low' && r.required != null && r.inStock != null
          ? Math.ceil((r.required - r.inStock) * 10) / 10
          : r.required ?? 1;

        return prisma.groceryItem.create({
          data: {
            listId: body.groceryListId,
            name: r.name,
            quantity: qty,
            unit: r.unit ?? null,
            state: 'NEEDED',
          },
        });
      })
    );

    res.status(201).json({ added: items.length, skipped, items });
  })
);

// ─── Entries by Date Range ───────────────────────────────────────────────────

mealPlansRouter.get(
  '/entries-by-range',
  asyncHandler(async (req, res) => {
    const { start, end } = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);

    const endDate = new Date(end + 'T23:59:59Z');
    const windowStart = new Date(start);
    windowStart.setDate(windowStart.getDate() - 6); // dayOffset can push entries up to 6 days past weekStart

    const plans = await prisma.mealPlan.findMany({
      where: { weekStart: { gte: windowStart, lte: endDate } },
      include: {
        entries: {
          select: { id: true, title: true, mealType: true, dayOffset: true, servings: true, notes: true, recipeId: true, mealPlanId: true },
        },
      },
    });

    const items: Array<{
      id: number; title: string; mealType: string; actualDate: string;
      servings: number; notes: string | null; recipeId: number | null; mealPlanId: number;
    }> = [];

    for (const plan of plans) {
      for (const entry of plan.entries) {
        const actualDate = new Date(plan.weekStart);
        actualDate.setUTCDate(actualDate.getUTCDate() + entry.dayOffset);
        const dateStr = actualDate.toISOString().slice(0, 10);
        if (dateStr >= start && dateStr <= end) {
          items.push({ id: entry.id, title: entry.title, mealType: entry.mealType, actualDate: dateStr, servings: entry.servings, notes: entry.notes, recipeId: entry.recipeId, mealPlanId: entry.mealPlanId });
        }
      }
    }

    res.json({ items });
  })
);

// ─── Meal Plans ───────────────────────────────────────────────────────────────

const entrySelect = {
  id: true,
  mealPlanId: true,
  recipeId: true,
  title: true,
  mealType: true,
  dayOffset: true,
  servings: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  recipe: { select: { id: true, title: true } },
} as const;

mealPlansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [items, total] = await Promise.all([
      prisma.mealPlan.findMany({
        orderBy: { weekStart: 'desc' },
        take: 20,
        include: { entries: { select: entrySelect, orderBy: [{ dayOffset: 'asc' }, { mealType: 'asc' }] } },
      }),
      prisma.mealPlan.count(),
    ]);

    res.json({ items, total });
  })
);

mealPlansRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const payload = createPlanSchema.parse(req.body ?? {});

    const weekStart = new Date(payload.weekStart);

    const plan = await prisma.mealPlan.create({
      data: {
        title: payload.title ?? null,
        weekStart,
        createdByUserId: userId,
      },
      include: { entries: { select: entrySelect } },
    });

    res.status(201).json(plan);
  })
);

mealPlansRouter.get(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = planIdParams.parse(req.params);
    const plan = await prisma.mealPlan.findUnique({
      where: { id: planId },
      include: { entries: { select: entrySelect, orderBy: [{ dayOffset: 'asc' }, { mealType: 'asc' }] } },
    });

    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Meal plan not found' } });
    }

    res.json(plan);
  })
);

mealPlansRouter.patch(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = planIdParams.parse(req.params);
    const payload = updatePlanSchema.parse(req.body ?? {});

    try {
      const plan = await prisma.mealPlan.update({
        where: { id: planId },
        data: { title: payload.title ?? null },
        include: { entries: { select: entrySelect } },
      });
      res.json(plan);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Meal plan not found' } });
      }
      throw err;
    }
  })
);

mealPlansRouter.delete(
  '/:planId',
  asyncHandler(async (req, res) => {
    const { planId } = planIdParams.parse(req.params);
    try {
      await prisma.mealPlan.delete({ where: { id: planId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Meal plan not found' } });
      }
      throw err;
    }
  })
);

// ─── Entries ─────────────────────────────────────────────────────────────────

mealPlansRouter.post(
  '/:planId/entries',
  asyncHandler(async (req, res) => {
    const { planId } = planIdParams.parse(req.params);
    const payload = createEntrySchema.parse(req.body ?? {});

    const plan = await prisma.mealPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Meal plan not found' } });
    }

    // Validate recipe exists if provided
    if (payload.recipeId) {
      const recipe = await prisma.recipe.findUnique({ where: { id: payload.recipeId } });
      if (!recipe) {
        return res.status(404).json({ error: { code: 'RECIPE_NOT_FOUND', message: 'Recipe not found' } });
      }
    }

    const entry = await prisma.mealPlanEntry.create({
      data: {
        mealPlanId: planId,
        recipeId: payload.recipeId ?? null,
        title: payload.title,
        mealType: payload.mealType,
        dayOffset: payload.dayOffset,
        servings: payload.servings,
        notes: payload.notes ?? null,
      },
      select: entrySelect,
    });

    res.status(201).json(entry);
  })
);

mealPlansRouter.patch(
  '/:planId/entries/:entryId',
  asyncHandler(async (req, res) => {
    const { planId, entryId } = entryIdParams.parse(req.params);
    const payload = updateEntrySchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const existing = await prisma.mealPlanEntry.findFirst({ where: { id: entryId, mealPlanId: planId } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'ENTRY_NOT_FOUND', message: 'Entry not found' } });
    }

    const data: Prisma.MealPlanEntryUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.mealType !== undefined) data.mealType = payload.mealType;
    if (payload.dayOffset !== undefined) data.dayOffset = payload.dayOffset;
    if (payload.servings !== undefined) data.servings = payload.servings;
    if (payload.notes !== undefined) data.notes = payload.notes ?? null;
    if (payload.recipeId !== undefined) {
      data.recipe = payload.recipeId ? { connect: { id: payload.recipeId } } : { disconnect: true };
    }

    const entry = await prisma.mealPlanEntry.update({
      where: { id: entryId },
      data,
      select: entrySelect,
    });

    res.json(entry);
  })
);

mealPlansRouter.delete(
  '/:planId/entries/:entryId',
  asyncHandler(async (req, res) => {
    const { planId, entryId } = entryIdParams.parse(req.params);

    const existing = await prisma.mealPlanEntry.findFirst({ where: { id: entryId, mealPlanId: planId } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'ENTRY_NOT_FOUND', message: 'Entry not found' } });
    }

    await prisma.mealPlanEntry.delete({ where: { id: entryId } });
    res.status(204).send();
  })
);

// ─── Send to Grocery ─────────────────────────────────────────────────────────

mealPlansRouter.post(
  '/:planId/send-to-grocery',
  asyncHandler(async (req, res) => {
    const { planId } = planIdParams.parse(req.params);
    const { groceryListId } = sendToGrocerySchema.parse(req.body ?? {});

    const plan = await prisma.mealPlan.findUnique({
      where: { id: planId },
      include: {
        entries: {
          where: { recipeId: { not: null } },
          include: { recipe: true },
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'Meal plan not found' } });
    }

    const groceryList = await prisma.groceryList.findUnique({ where: { id: groceryListId } });
    if (!groceryList) {
      return res.status(404).json({ error: { code: 'LIST_NOT_FOUND', message: 'Grocery list not found' } });
    }

    // Collect all ingredients from all entries that have recipes
    const ingredientsToAdd: Array<{ name: string; quantity?: number; unit?: string }> = [];
    for (const entry of plan.entries) {
      if (!entry.recipe) continue;
      const ingredients = parseIngredients(entry.recipe.ingredientsJson);
      const multiplier = entry.servings / (entry.recipe.servings || 1);
      for (const ing of ingredients) {
        ingredientsToAdd.push({
          name: ing.name,
          quantity: ing.quantity != null ? Math.ceil(ing.quantity * multiplier * 10) / 10 : undefined,
          unit: ing.unit,
        });
      }
    }

    if (ingredientsToAdd.length === 0) {
      return res.status(400).json({ error: { code: 'NO_INGREDIENTS', message: 'No recipe ingredients found in this meal plan' } });
    }

    // Avoid duplicating items already on the list
    const existingItems = await prisma.groceryItem.findMany({ where: { listId: groceryListId } });
    const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase().trim()));
    const toAdd = ingredientsToAdd.filter((i) => !existingNames.has(i.name.toLowerCase().trim()));

    if (toAdd.length === 0) {
      return res.json({ added: 0, skipped: ingredientsToAdd.length, items: [] });
    }

    const items = await prisma.$transaction(
      toAdd.map((ing) =>
        prisma.groceryItem.create({
          data: {
            listId: groceryListId,
            name: ing.name,
            quantity: ing.quantity ?? 1,
            unit: ing.unit ?? null,
            state: 'NEEDED',
          },
        })
      )
    );

    res.status(201).json({ added: items.length, skipped: ingredientsToAdd.length - items.length, items });
  })
);
