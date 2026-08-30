/**
 * Matching recipe ingredients to pantry inventory items.
 *
 * This lives in one place because the same rule is applied on the server
 * (recipe inventory-check, add-missing-to-grocery) and mirrored in the UI
 * (frontend/src/utils/ingredientMatch.ts). If you change the rule here,
 * change it there too — a silent disagreement shows the user one status in
 * the recipe list and a different one after clicking into it.
 *
 * Why more than exact equality: the inventory uses a "Noun, Qualifier"
 * naming convention ("Salt, Kosher", "Flour, All Purpose", "Sugar, Dark
 * Brown"), while recipes name the ingredient plainly ("Salt") or with a
 * preparation ("Garlic, minced"). Exact matching therefore failed on almost
 * everything — "Salt" never found "Salt, Kosher".
 */

export interface MatchableInventoryItem {
  id: number;
  name: string;
  pantryItemKey?: string | null;
}

export interface MatchableIngredient {
  name: string;
  inventoryItemId?: number;
}

/** Lowercase, drop parentheticals and punctuation, collapse whitespace. */
export function normalizeItemName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "'") // curly quotes -> straight ("Brewer's Yeast")
    .replace(/\([^)]*\)/g, ' ')                  // "(optional)", "(for rice)"
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The part before the first comma — the ingredient itself, minus the variety
 * or preparation. "Salt, Kosher" -> "salt"; "Garlic, minced" -> "garlic".
 */
export function headNoun(raw: string): string {
  return normalizeItemName(raw.split(',')[0] ?? '');
}

/**
 * Resolve an ingredient to an inventory item, most confident first:
 *   1. an explicit inventoryItemId link (always wins)
 *   2. exact name match
 *   3. normalized full-name match
 *   4. head-noun match ("Salt" -> "Salt, Kosher")
 *
 * Returns undefined when nothing matches. Head-noun matches can be ambiguous
 * ("Sugar" against both "Sugar, Dark Brown" and "Sugar, Powdered"); we sort by
 * name and take the first so the result is at least deterministic rather than
 * dependent on database ordering.
 */
export function findInventoryMatch<T extends MatchableInventoryItem>(
  ingredient: MatchableIngredient,
  inventory: T[]
): T | undefined {
  if (ingredient.inventoryItemId != null) {
    const linked = inventory.find((i) => i.id === ingredient.inventoryItemId);
    if (linked) return linked;
    // A dangling link is deliberately not retried by name: the user linked this
    // explicitly, so reporting it unmatched is more honest than guessing.
    return undefined;
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
