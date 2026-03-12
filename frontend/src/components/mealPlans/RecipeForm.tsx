import { useState } from 'react';
import type { Recipe, RecipeIngredient } from '../../types/mealPlan';
import type { CreateRecipePayload } from '../../api/mealPlans';
import type { InventoryItem } from '../../types/inventory';

interface RecipeFormProps {
  editingRecipe?: Recipe | null;
  inventoryItems: InventoryItem[];
  onSave: (payload: CreateRecipePayload) => Promise<void>;
  onCancel: () => void;
  isPending?: boolean;
}

const emptyIngredient = (): RecipeIngredient => ({ name: '', quantity: undefined, unit: '', inventoryItemId: undefined });

export function RecipeForm({ editingRecipe, inventoryItems, onSave, onCancel, isPending }: RecipeFormProps) {
  const [title, setTitle] = useState(editingRecipe?.title ?? '');
  const [description, setDescription] = useState(editingRecipe?.description ?? '');
  const [servings, setServings] = useState(editingRecipe?.servings ?? 4);
  const [prepMinutes, setPrepMinutes] = useState<string | number>(editingRecipe?.prepMinutes ?? '');
  const [cookMinutes, setCookMinutes] = useState<string | number>(editingRecipe?.cookMinutes ?? '');
  const [sourceUrl, setSourceUrl] = useState(editingRecipe?.sourceUrl ?? '');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    editingRecipe?.ingredients?.length ? editingRecipe.ingredients : [emptyIngredient()]
  );

  const updateIngredient = (index: number, field: keyof RecipeIngredient, value: string | number | undefined) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const updated: RecipeIngredient = {
          ...ing,
          [field]: field === 'quantity'
            ? (value === '' || value === undefined ? undefined : parseFloat(String(value)) || undefined)
            : value,
        };
        // Auto-link/unlink by name when the name field changes
        if (field === 'name' && typeof value === 'string') {
          const match = inventoryItems.find(
            (item) => item.name.toLowerCase().trim() === value.toLowerCase().trim()
          );
          if (match) {
            updated.inventoryItemId = match.id;
            updated.unit = updated.unit || match.unit || undefined;
          } else {
            updated.inventoryItemId = undefined;
          }
        }
        return updated;
      })
    );
  };

  const unlinkInventoryItem = (index: number) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, inventoryItemId: undefined } : ing))
    );
  };

  const addIngredient = () => setIngredients((prev) => [...prev, emptyIngredient()]);
  const removeIngredient = (index: number) =>
    setIngredients((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validIngredients = ingredients.filter((i) => i.name.trim());
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      servings,
      prepMinutes: prepMinutes !== '' ? parseInt(String(prepMinutes), 10) : null,
      cookMinutes: cookMinutes !== '' ? parseInt(String(cookMinutes), 10) : null,
      sourceUrl: sourceUrl.trim() || null,
      ingredients: validIngredients.map((i) => ({
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit?.trim() || undefined,
        inventoryItemId: i.inventoryItemId,
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-heading mb-1">Recipe name</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Spaghetti Bolognese"
          className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-heading mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Brief description…"
          className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Servings</label>
          <input
            type="number"
            value={servings}
            onChange={(e) => setServings(Math.max(1, parseInt(e.target.value, 10) || 1))}
            min={1}
            max={100}
            className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Prep (min)</label>
          <input
            type="number"
            value={prepMinutes}
            onChange={(e) => setPrepMinutes(e.target.value)}
            min={0}
            placeholder="—"
            className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Cook (min)</label>
          <input
            type="number"
            value={cookMinutes}
            onChange={(e) => setCookMinutes(e.target.value)}
            min={0}
            placeholder="—"
            className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-heading mb-1">Source URL (optional)</label>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
        />
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-heading">Ingredients</label>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs text-accent hover:underline"
          >
            + Add ingredient
          </button>
        </div>
        <div className="space-y-3">
          {ingredients.map((ing, idx) => {
            const linkedItem = ing.inventoryItemId
              ? inventoryItems.find((i) => i.id === ing.inventoryItemId)
              : null;

            return (
              <div key={idx} className="rounded-lg border border-th-border-light bg-page p-2 space-y-2">
                {/* Name + qty + unit row */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                    placeholder="Ingredient"
                    className="flex-1 rounded-lg border border-input bg-input px-3 py-1.5 text-sm text-heading placeholder:text-faint"
                  />
                  <input
                    type="number"
                    value={ing.quantity ?? ''}
                    onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                    placeholder="Qty"
                    min={0}
                    step="any"
                    className="w-16 rounded-lg border border-input bg-input px-2 py-1.5 text-sm text-heading placeholder:text-faint"
                  />
                  <input
                    type="text"
                    value={ing.unit ?? ''}
                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-16 rounded-lg border border-input bg-input px-2 py-1.5 text-sm text-heading placeholder:text-faint"
                  />
                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredient(idx)}
                      className="text-muted hover:text-red-500 text-sm shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Inventory link status */}
                {linkedItem && (
                  <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1">
                    <span className="text-xs text-emerald-700 font-medium">
                      📦 {linkedItem.name}
                      {linkedItem.quantity != null && (
                        <span className="font-normal text-emerald-600 ml-1">
                          — {linkedItem.quantity}{linkedItem.unit ? ` ${linkedItem.unit}` : ''} in stock
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => unlinkInventoryItem(idx)}
                      className="text-xs text-emerald-500 hover:text-red-500 ml-2"
                    >
                      Unlink
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-th-border px-4 py-2 text-sm text-secondary hover:bg-hover-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text disabled:opacity-50"
        >
          {isPending ? 'Saving…' : editingRecipe ? 'Save changes' : 'Create recipe'}
        </button>
      </div>
    </form>
  );
}
