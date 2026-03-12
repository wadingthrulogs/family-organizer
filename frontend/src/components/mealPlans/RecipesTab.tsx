import { useState } from 'react';
import type { Recipe, RecipeIngredient, IngredientStatus } from '../../types/mealPlan';
import type { CreateRecipePayload } from '../../api/mealPlans';
import type { InventoryItem } from '../../types/inventory';
import { RecipeForm } from './RecipeForm';
import { useAddMissingToGroceryMutation } from '../../hooks/useMealPlanMutations';

interface RecipesTabProps {
  recipes: Recipe[];
  inventoryItems: InventoryItem[];
  groceryLists: Array<{ id: number; name: string }>;
  onCreateRecipe: (payload: CreateRecipePayload) => Promise<void>;
  onUpdateRecipe: (recipeId: number, payload: CreateRecipePayload) => Promise<void>;
  onDeleteRecipe: (recipeId: number) => Promise<void>;
  isCreating?: boolean;
  isUpdating?: boolean;
}

// ─── Availability helpers ─────────────────────────────────────────────────────

function getIngredientStatus(
  ing: RecipeIngredient,
  inventoryItems: InventoryItem[],
  servings: number,
  recipeServings: number
): { status: IngredientStatus; inStock?: number; required?: number; invItem?: InventoryItem } {
  const invItem = ing.inventoryItemId
    ? inventoryItems.find((i) => i.id === ing.inventoryItemId)
    : inventoryItems.find((i) => i.name.toLowerCase().trim() === ing.name.toLowerCase().trim());

  const required =
    ing.quantity != null ? Math.round((ing.quantity * (servings / (recipeServings || 1))) * 100) / 100 : undefined;

  if (!invItem) {
    const status: IngredientStatus = ing.inventoryItemId || ing.quantity != null ? 'missing' : 'unlinked';
    return { status, required };
  }

  const inStock = invItem.quantity;
  let status: IngredientStatus;
  if (required == null || required === 0) {
    status = inStock > 0 ? 'ok' : 'missing';
  } else {
    status = inStock >= required ? 'ok' : 'low';
  }

  return { status, inStock, required, invItem };
}

type RecipeAvailability = 'ready' | 'low' | 'missing' | 'none';

function getRecipeAvailability(recipe: Recipe, inventoryItems: InventoryItem[], servings: number): RecipeAvailability {
  const linked = recipe.ingredients.filter(
    (i) => i.inventoryItemId || inventoryItems.some((inv) => inv.name.toLowerCase().trim() === i.name.toLowerCase().trim())
  );
  if (linked.length === 0) return 'none';

  const statuses = linked.map((ing) => getIngredientStatus(ing, inventoryItems, servings, recipe.servings).status);
  if (statuses.some((s) => s === 'missing')) return 'missing';
  if (statuses.some((s) => s === 'low')) return 'low';
  return 'ready';
}

function AvailabilityBadge({ availability }: { availability: RecipeAvailability }) {
  if (availability === 'none') return null;
  if (availability === 'ready') return <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">✓ Ready</span>;
  if (availability === 'low') return <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">⚠ Low stock</span>;
  return <span className="text-xs font-medium text-red-500 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">✕ Missing items</span>;
}

function IngredientStatusIcon({ status, required, inStock, unit }: { status: IngredientStatus; required?: number; inStock?: number; unit?: string }) {
  if (status === 'unlinked') return null;
  if (status === 'ok') return <span className="text-emerald-500 text-xs ml-1">✓</span>;
  if (status === 'low') {
    const unitStr = unit ? ` ${unit}` : '';
    return (
      <span className="text-amber-500 text-xs ml-1" title={`Need ${required}${unitStr}, have ${inStock}${unitStr}`}>
        ⚠ ({inStock}{unitStr} / {required}{unitStr} needed)
      </span>
    );
  }
  return <span className="text-red-400 text-xs ml-1">✗ not in inventory</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RecipesTab({
  recipes,
  inventoryItems,
  groceryLists,
  onCreateRecipe,
  onUpdateRecipe,
  onDeleteRecipe,
  isCreating,
  isUpdating,
}: RecipesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [servingsOverride, setServingsOverride] = useState<Record<number, number>>({});
  const [showGroceryDropdown, setShowGroceryDropdown] = useState<number | null>(null);
  const [addResult, setAddResult] = useState<Record<number, string>>({});

  const addMissing = useAddMissingToGroceryMutation();

  const getServings = (recipe: Recipe) => servingsOverride[recipe.id] ?? recipe.servings;

  const handleSave = async (payload: CreateRecipePayload) => {
    if (editingRecipe) {
      await onUpdateRecipe(editingRecipe.id, payload);
    } else {
      await onCreateRecipe(payload);
    }
    setShowForm(false);
    setEditingRecipe(null);
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setShowForm(true);
  };

  const handleDelete = async (recipe: Recipe) => {
    if (!confirm(`Delete recipe "${recipe.title}"?`)) return;
    await onDeleteRecipe(recipe.id);
    if (expandedId === recipe.id) setExpandedId(null);
  };

  const handleAddMissing = async (recipe: Recipe, listId: number) => {
    setShowGroceryDropdown(null);
    try {
      const result = await addMissing.mutateAsync({ recipeId: recipe.id, groceryListId: listId, servings: getServings(recipe) });
      const listName = groceryLists.find((l) => l.id === listId)?.name ?? 'list';
      setAddResult((prev) => ({
        ...prev,
        [recipe.id]: `Added ${result.added} item${result.added !== 1 ? 's' : ''} to ${listName}${result.skipped > 0 ? ` (${result.skipped} already on list)` : ''}`,
      }));
      setTimeout(() => setAddResult((prev) => { const n = { ...prev }; delete n[recipe.id]; return n; }), 4000);
    } catch {
      setAddResult((prev) => ({ ...prev, [recipe.id]: 'Failed to add items.' }));
      setTimeout(() => setAddResult((prev) => { const n = { ...prev }; delete n[recipe.id]; return n; }), 3000);
    }
  };

  const formatTime = (min: number | null | undefined) => {
    if (!min) return null;
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ''}`.trim() : `${min}m`;
  };

  return (
    <div>
      {/* Tab header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-heading">📖 Recipes</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setEditingRecipe(null); setShowForm(true); }}
            className="rounded-lg bg-btn-primary px-3 py-1.5 text-sm font-medium text-btn-primary-text"
          >
            + New recipe
          </button>
        )}
      </div>

      {showForm ? (
        <div>
          <h3 className="text-base font-semibold text-heading mb-4">
            {editingRecipe ? `Edit: ${editingRecipe.title}` : 'New recipe'}
          </h3>
          <RecipeForm
            editingRecipe={editingRecipe}
            inventoryItems={inventoryItems}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingRecipe(null); }}
            isPending={isCreating || isUpdating}
          />
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">
          No recipes yet. Create one to link it to meal plan entries.
        </p>
      ) : (
        <div className="space-y-2">
          {recipes.map((recipe) => {
            const servings = getServings(recipe);
            const availability = getRecipeAvailability(recipe, inventoryItems, servings);
            const isExpanded = expandedId === recipe.id;
            const hasMissing = availability === 'missing' || availability === 'low';

            return (
              <div key={recipe.id} className="rounded-card border border-th-border bg-page overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-hover-bg gap-2"
                  onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-heading text-sm">{recipe.title}</p>
                      <AvailabilityBadge availability={availability} />
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {recipe.servings} servings
                      {formatTime(recipe.prepMinutes) && ` · prep ${formatTime(recipe.prepMinutes)}`}
                      {formatTime(recipe.cookMinutes) && ` · cook ${formatTime(recipe.cookMinutes)}`}
                      {recipe.ingredients.length > 0 && ` · ${recipe.ingredients.length} ingredients`}
                    </p>
                  </div>
                  <span className="text-faint text-xs mt-1 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-th-border-light space-y-3">
                    {recipe.description && (
                      <p className="text-sm text-secondary mt-3">{recipe.description}</p>
                    )}

                    {/* Servings stepper */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted">Check for</span>
                      <div className="flex items-center rounded-lg border border-input overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setServingsOverride((prev) => ({ ...prev, [recipe.id]: Math.max(1, servings - 1) }))}
                          className="px-2 py-1 text-xs text-secondary hover:bg-hover-bg border-r border-input"
                        >
                          −
                        </button>
                        <span className="px-3 py-1 text-xs text-heading font-medium">{servings}</span>
                        <button
                          type="button"
                          onClick={() => setServingsOverride((prev) => ({ ...prev, [recipe.id]: servings + 1 }))}
                          className="px-2 py-1 text-xs text-secondary hover:bg-hover-bg border-l border-input"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs text-muted">servings</span>
                      {servings !== recipe.servings && (
                        <button
                          type="button"
                          onClick={() => setServingsOverride((prev) => { const n = { ...prev }; delete n[recipe.id]; return n; })}
                          className="text-xs text-accent hover:underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Ingredients with stock status */}
                    {recipe.ingredients.length > 0 && (
                      <ul className="space-y-1">
                        {recipe.ingredients.map((ing, i) => {
                          const { status, inStock, required, invItem } = getIngredientStatus(
                            ing, inventoryItems, servings, recipe.servings
                          );
                          return (
                            <li key={i} className="text-xs text-heading flex items-center flex-wrap gap-x-1">
                              {ing.quantity != null && (
                                <span className="text-muted">{ing.quantity}{ing.unit ? ` ${ing.unit}` : ''}</span>
                              )}
                              <span>{ing.name}</span>
                              {invItem && status !== 'ok' && (
                                <span className="text-faint text-[10px]">({invItem.name})</span>
                              )}
                              <IngredientStatusIcon
                                status={status}
                                required={required}
                                inStock={inStock}
                                unit={ing.unit ?? invItem?.unit ?? undefined}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {recipe.sourceUrl && (
                      <a
                        href={recipe.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-accent hover:underline"
                      >
                        View source →
                      </a>
                    )}

                    {/* Add missing to grocery */}
                    {hasMissing && groceryLists.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowGroceryDropdown(showGroceryDropdown === recipe.id ? null : recipe.id)}
                          disabled={addMissing.isPending}
                          className="text-xs font-medium text-btn-primary-text bg-btn-primary rounded-lg px-3 py-1.5 disabled:opacity-50"
                        >
                          🛒 Add missing to grocery ▾
                        </button>
                        {showGroceryDropdown === recipe.id && (
                          <div className="absolute left-0 top-full mt-1 z-20 rounded-card bg-card border border-th-border shadow-soft min-w-[180px]">
                            {groceryLists.map((list) => (
                              <button
                                key={list.id}
                                type="button"
                                onClick={() => handleAddMissing(recipe, list.id)}
                                className="block w-full text-left px-3 py-2 text-sm text-heading hover:bg-hover-bg"
                              >
                                {list.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Result message */}
                    {addResult[recipe.id] && (
                      <p className="text-xs text-secondary">{addResult[recipe.id]}</p>
                    )}

                    {/* Edit / Delete */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(recipe)}
                        className="text-xs text-secondary hover:text-heading border border-th-border rounded px-2 py-1"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(recipe)}
                        className="text-xs text-red-500 hover:text-red-600 border border-red-200 rounded px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Close grocery dropdown on outside click */}
      {showGroceryDropdown !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setShowGroceryDropdown(null)} />
      )}
    </div>
  );
}
