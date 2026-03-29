import { useState, useEffect } from 'react';
import type { MealPlanEntry, MealType, Recipe } from '../../types/mealPlan';
import type { CreateMealPlanEntryPayload } from '../../api/mealPlans';
import { Modal } from '../ui/Modal';

const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast', icon: '🌅' },
  { value: 'LUNCH', label: 'Lunch', icon: '☀️' },
  { value: 'DINNER', label: 'Dinner', icon: '🌙' },
  { value: 'SNACK', label: 'Snack', icon: '🍎' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AddMealEntryModalProps {
  initialDayOffset?: number;
  initialMealType?: MealType;
  editingEntry?: MealPlanEntry | null;
  recipes: Recipe[];
  onSave: (payload: CreateMealPlanEntryPayload) => Promise<void>;
  onClose: () => void;
  isPending?: boolean;
}

export function AddMealEntryModal({
  initialDayOffset = 0,
  initialMealType = 'DINNER',
  editingEntry,
  recipes,
  onSave,
  onClose,
  isPending,
}: AddMealEntryModalProps) {
  const [title, setTitle] = useState(editingEntry?.title ?? '');
  const [mealType, setMealType] = useState<MealType>(editingEntry?.mealType ?? initialMealType);
  const [dayOffset, setDayOffset] = useState(editingEntry?.dayOffset ?? initialDayOffset);
  const [servings, setServings] = useState(editingEntry?.servings ?? 1);
  const [notes, setNotes] = useState(editingEntry?.notes ?? '');
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(editingEntry?.recipeId ?? null);

  useEffect(() => {
    if (selectedRecipeId) {
      const recipe = recipes.find((r) => r.id === selectedRecipeId);
      if (recipe && !title) setTitle(recipe.title);
    }
  }, [selectedRecipeId, recipes, title]);

  const handleRecipeChange = (recipeId: number | null) => {
    setSelectedRecipeId(recipeId);
    if (recipeId) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe) setTitle(recipe.title);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      mealType,
      dayOffset,
      servings,
      notes: notes.trim() || null,
      recipeId: selectedRecipeId,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editingEntry ? 'Edit Meal' : 'Add Meal'}
      maxWidth="max-w-md"
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Day */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Day</label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setDayOffset(i)}
                  className={`rounded py-1.5 text-xs font-medium transition-colors ${
                    dayOffset === i
                      ? 'bg-btn-primary text-btn-primary-text'
                      : 'bg-input border border-input text-secondary hover:bg-hover-bg'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Meal type */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Meal</label>
            <div className="grid grid-cols-4 gap-1">
              {MEAL_TYPES.map((mt) => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setMealType(mt.value)}
                  className={`rounded py-1.5 text-xs font-medium transition-colors ${
                    mealType === mt.value
                      ? 'bg-btn-primary text-btn-primary-text'
                      : 'bg-input border border-input text-secondary hover:bg-hover-bg'
                  }`}
                >
                  {mt.icon} {mt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipe (optional) */}
          {recipes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Recipe (optional)</label>
              <select
                value={selectedRecipeId ?? ''}
                onChange={(e) => handleRecipeChange(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading"
              >
                <option value="">— Free text —</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Meal name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pasta carbonara"
              required
              className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
            />
          </div>

          {/* Servings */}
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

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes…"
              className="w-full rounded-lg border border-input bg-input px-3 py-2 text-sm text-heading placeholder:text-faint"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-th-border px-4 py-2 text-sm text-secondary hover:bg-hover-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="rounded-lg bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-text disabled:opacity-50"
            >
              {isPending ? 'Saving…' : editingEntry ? 'Save changes' : 'Add meal'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
