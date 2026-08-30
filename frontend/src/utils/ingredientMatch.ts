/**
 * Matching recipe ingredients to pantry inventory items.
 *
 * MIRRORS backend/src/utils/ingredient-match.ts — keep the two in step. A
 * silent disagreement shows one availability badge in the recipe list and a
 * different status after opening the recipe.
 *
 * Why more than exact equality: inventory uses a "Noun, Qualifier" convention
 * ("Salt, Kosher", "Flour, All Purpose"), while recipes name things plainly
 * ("Salt") or with a preparation ("Garlic, minced"). Exact matching failed on
 * nearly everything.
 */

export interface MatchableInventoryItem {
  id: number;
  name: string;
}

export interface MatchableIngredient {
  name: string;
  inventoryItemId?: number;
}

/** Lowercase, drop parentheticals and punctuation, collapse whitespace. */
export function normalizeItemName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The part before the first comma. "Salt, Kosher" -> "salt". */
export function headNoun(raw: string): string {
  return normalizeItemName(raw.split(',')[0] ?? '');
}

/**
 * Resolve an ingredient to an inventory item, most confident first:
 * explicit link, exact name, normalized name, then head noun.
 * Ambiguous head-noun matches are sorted by name so the result is stable.
 */
export function findInventoryMatch<T extends MatchableInventoryItem>(
  ingredient: MatchableIngredient,
  inventory: T[]
): T | undefined {
  if (ingredient.inventoryItemId != null) {
    return inventory.find((i) => i.id === ingredient.inventoryItemId);
  }

  const exactTarget = ingredient.name.toLowerCase().trim();
  const exact = inventory.find((i) => i.name.toLowerCase().trim() === exactTarget);
  if (exact) return exact;

  const normTarget = normalizeItemName(ingredient.name);
  if (!normTarget) return undefined;

  const normed = inventory.filter((i) => normalizeItemName(i.name) === normTarget);
  if (normed.length) return normed.sort((a, b) => a.name.localeCompare(b.name))[0];

  const headTarget = headNoun(ingredient.name);
  if (!headTarget) return undefined;

  const byHead = inventory.filter((i) => headNoun(i.name) === headTarget);
  if (byHead.length) return byHead.sort((a, b) => a.name.localeCompare(b.name))[0];

  return undefined;
}
