import { useState, useRef } from 'react';
import type { Recipe, RecipeIngredient, IngredientStatus } from '../../types/mealPlan';
import type { CreateRecipePayload } from '../../api/mealPlans';
import type { InventoryItem } from '../../types/inventory';
import { RecipeForm } from './RecipeForm';
import { useAddMissingToGroceryMutation, useBulkImportRecipesMutation, useCreateRecipeMutation } from '../../hooks/useMealPlanMutations';

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
    status = inStock > 0 ? 'ok' : 'low';
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

function IngredientStatusIcon({ status }: { status: IngredientStatus }) {
  if (status === 'ok') {
    return <span className="inline-flex items-center gap-1 text-xs ml-1 font-medium text-emerald-600">✓ In stock</span>;
  }
  if (status === 'low') {
    return <span className="inline-flex items-center gap-1 text-xs ml-1 font-medium text-red-500">✗ Out of stock</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs ml-1 font-medium text-gray-400">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2.5" y1="9.5" x2="9.5" y2="2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Not in inventory
    </span>
  );
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

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'text' | 'json'>('text');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [jsonProgress, setJsonProgress] = useState('');
  const jsonFileRef = useRef<HTMLInputElement>(null);

  const addMissing = useAddMissingToGroceryMutation();
  const bulkImport = useBulkImportRecipesMutation();
  const createRecipeMutation = useCreateRecipeMutation();

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

  const openImport = () => {
    setImportOpen(true);
    setImportTab('text');
    setImportText('');
    setImportError('');
    setImportSuccess('');
    setJsonProgress('');
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportText('');
    setImportError('');
    setImportSuccess('');
    setJsonProgress('');
  };

  const handleTextImport = async () => {
    if (!importText.trim()) {
      setImportError('Please paste some recipe text first.');
      return;
    }
    setImportError('');
    setImportSuccess('');
    try {
      const result = await bulkImport.mutateAsync(importText);
      setImportSuccess(`Imported ${result.total} recipe${result.total !== 1 ? 's' : ''} successfully.`);
      setImportText('');
    } catch {
      setImportError('Import failed. Check your text format and try again.');
    }
  };

  const handleJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportSuccess('');
    setJsonProgress('');

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setImportError('Invalid JSON file. Please check the file format.');
      if (jsonFileRef.current) jsonFileRef.current.value = '';
      return;
    }

    if (!Array.isArray(parsed)) {
      setImportError('JSON must be an array of recipe objects.');
      if (jsonFileRef.current) jsonFileRef.current.value = '';
      return;
    }

    const items = parsed as Array<Record<string, unknown>>;
    const invalid = items.find((r) => typeof r.title !== 'string' || !r.title.trim());
    if (invalid !== undefined) {
      setImportError('Every recipe object must have a "title" string field.');
      if (jsonFileRef.current) jsonFileRef.current.value = '';
      return;
    }

    let imported = 0;
    for (const item of items) {
      try {
        setJsonProgress(`Importing ${imported + 1} of ${items.length}…`);
        await createRecipeMutation.mutateAsync({
          title: item.title as string,
          description: (item.description as string | undefined) ?? null,
          servings: (item.servings as number | undefined) ?? 1,
          prepMinutes: (item.prepMinutes as number | undefined) ?? null,
          cookMinutes: (item.cookMinutes as number | undefined) ?? null,
          sourceUrl: (item.sourceUrl as string | undefined) ?? null,
          ingredients: Array.isArray(item.ingredients) ? item.ingredients as CreateRecipePayload['ingredients'] : [],
        });
        imported++;
      } catch {
        setImportError(`Failed on recipe "${item.title}" (${imported} of ${items.length} imported so far).`);
        setJsonProgress('');
        if (jsonFileRef.current) jsonFileRef.current.value = '';
        return;
      }
    }

    setJsonProgress('');
    setImportSuccess(`Imported ${imported} recipe${imported !== 1 ? 's' : ''} from JSON.`);
    if (jsonFileRef.current) jsonFileRef.current.value = '';
  };

  return (
    <div>
      {/* Tab header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-heading">📖 Recipes</h2>
        {!showForm && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openImport}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              ↑ Import
            </button>
            <button
              type="button"
              onClick={() => { setEditingRecipe(null); setShowForm(true); }}
              className="rounded-lg bg-btn-primary px-3 py-1.5 text-sm font-medium text-btn-primary-text"
            >
              + New recipe
            </button>
          </div>
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
              <div key={recipe.id} className={`rounded-card border border-th-border bg-page ${showGroceryDropdown === recipe.id ? 'overflow-visible' : 'overflow-hidden'}`}>
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
                              <IngredientStatusIcon status={status} />
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

      {/* Import modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={closeImport} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--color-border)] shadow-xl flex flex-col max-h-[90vh]" style={{ backgroundColor: 'var(--color-card)', backgroundImage: 'none' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-heading">Import recipes</h3>
              <button type="button" onClick={closeImport} className="text-[var(--color-text-muted)] hover:text-heading text-lg leading-none">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--color-border)]">
              {(['text', 'json'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setImportTab(tab); setImportError(''); setImportSuccess(''); setJsonProgress(''); }}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    importTab === tab
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:text-heading'
                  }`}
                >
                  {tab === 'text' ? 'Paste text' : 'Upload JSON'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {importTab === 'text' ? (
                <>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Paste one or more recipes. Separate recipes with a blank line. First line is the title, remaining lines are ingredients.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-[var(--color-border-input)] bg-[var(--color-input)] px-3 py-2 text-sm text-heading placeholder:text-[var(--color-text-faint)] resize-y font-mono"
                    placeholder={`Pasta Bolognese\n500g beef mince\n2 cans diced tomatoes\n1 onion\n\nChicken Stir Fry\n2 chicken breasts\n1 cup broccoli\n2 tbsp soy sauce`}
                  />
                  {importError && <p className="text-xs text-red-500">{importError}</p>}
                  {importSuccess && <p className="text-xs text-emerald-600">{importSuccess}</p>}
                </>
              ) : (
                <>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Upload a <code className="bg-[var(--color-bg-hover)] px-1 rounded">.json</code> file containing an array of recipe objects. Each must have a <code className="bg-[var(--color-bg-hover)] px-1 rounded">title</code> field.
                  </p>
                  <pre className="text-xs bg-[var(--color-bg-hover)] rounded-lg p-3 overflow-x-auto text-[var(--color-text-secondary)]">{`[\n  {\n    "title": "Pasta Bolognese",\n    "description": "Classic Italian meat sauce",\n    "servings": 4,\n    "prepMinutes": 15,\n    "cookMinutes": 45,\n    "sourceUrl": "https://example.com/recipe",\n    "ingredients": [\n      { "name": "beef mince", "quantity": 500, "unit": "g" }\n    ]\n  }\n]`}</pre>
                  <input
                    ref={jsonFileRef}
                    type="file"
                    accept=".json"
                    onChange={handleJsonFile}
                    className="block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-lg file:border file:border-[var(--color-border)] file:bg-[var(--color-bg-hover)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--color-text-secondary)] file:cursor-pointer"
                  />
                  {jsonProgress && <p className="text-xs text-[var(--color-text-secondary)]">{jsonProgress}</p>}
                  {importError && <p className="text-xs text-red-500">{importError}</p>}
                  {importSuccess && <p className="text-xs text-emerald-600">{importSuccess}</p>}
                </>
              )}
            </div>

            {/* Footer */}
            {importTab === 'text' && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={closeImport}
                  className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTextImport}
                  disabled={bulkImport.isPending || !importText.trim()}
                  className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text disabled:opacity-50"
                >
                  {bulkImport.isPending ? 'Importing…' : 'Import'}
                </button>
              </div>
            )}
            {importTab === 'json' && importSuccess && (
              <div className="flex justify-end px-5 py-4 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={closeImport}
                  className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
