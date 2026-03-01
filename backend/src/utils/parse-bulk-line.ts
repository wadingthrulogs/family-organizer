export function parseBulkLine(line: string): { name: string; quantity: number; unit: string | null } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return { name: '', quantity: 1, unit: null };
  }

  // Strip list markers: "- ", "* ", "• ", "1. ", "1) "
  const cleaned = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '');

  // Pattern: "3x bananas" or "3 x bananas"
  const timesPattern = /^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i;
  let match = cleaned.match(timesPattern);
  if (match) {
    return { name: match[2].trim(), quantity: parseFloat(match[1]), unit: null };
  }

  // Pattern: "2 lbs chicken" or "500 ml milk" or "1.5 kg rice"
  const qtyUnitPattern = /^(\d+(?:\.\d+)?)\s+(oz|lb|lbs|kg|g|ml|l|L|gal|gallon|ct|count|can|cans|bag|bags|box|boxes|bunch|bunches|pack|packs|pkg|dozen|doz|cup|cups|qt|quart|pt|pint)\s+(.+)$/i;
  match = cleaned.match(qtyUnitPattern);
  if (match) {
    return { name: match[3].trim(), quantity: parseFloat(match[1]), unit: match[2].toLowerCase() };
  }

  // Pattern: "bananas 3" or "bananas x3"
  const trailingQtyPattern = /^(.+?)\s+x?(\d+(?:\.\d+)?)\s*$/i;
  match = cleaned.match(trailingQtyPattern);
  if (match) {
    return { name: match[1].trim(), quantity: parseFloat(match[2]), unit: null };
  }

  // Pattern: "3 bananas" (leading number without a recognized unit)
  const leadingQtyPattern = /^(\d+(?:\.\d+)?)\s+(.+)$/;
  match = cleaned.match(leadingQtyPattern);
  if (match) {
    return { name: match[2].trim(), quantity: parseFloat(match[1]), unit: null };
  }

  // No quantity found — just a name
  return { name: cleaned, quantity: 1, unit: null };
}
