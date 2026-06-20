import { prisma } from '../lib/prisma.js';

/**
 * Prepared-meal sync: an inventory item tagged `isPreparedMeal` is mirrored as a
 * Recipe whose single ingredient is linked back to that item (via inventoryItemId).
 * This lets store-bought/frozen meals flow through the meal planner's recipe picker,
 * inventory "Ready/Low/Missing" check, and "add missing to grocery" with no extra UI.
 */

type PreparedMealSource = {
  id: number;
  name: string;
  unit: string | null;
  notes: string | null;
};

function buildIngredientsJson(item: PreparedMealSource): string {
  return JSON.stringify([
    {
      name: item.name,
      quantity: 1,
      ...(item.unit ? { unit: item.unit } : {}),
      inventoryItemId: item.id,
    },
  ]);
}

/** Create the linked recipe for a prepared-meal item, or update it if it already exists. */
export async function upsertPreparedMealRecipe(item: PreparedMealSource, userId: number) {
  const existing = await prisma.recipe.findUnique({
    where: { sourceInventoryItemId: item.id },
  });

  const recipeData = {
    title: item.name,
    description: item.notes,
    ingredientsJson: buildIngredientsJson(item),
  };

  if (existing) {
    return prisma.recipe.update({ where: { id: existing.id }, data: recipeData });
  }

  return prisma.recipe.create({
    data: {
      ...recipeData,
      servings: 1,
      createdByUserId: userId,
      sourceInventoryItemId: item.id,
    },
  });
}

/** Remove the linked recipe for an inventory item (no-op if none exists). */
export async function deletePreparedMealRecipe(inventoryItemId: number) {
  await prisma.recipe.deleteMany({ where: { sourceInventoryItemId: inventoryItemId } });
}
