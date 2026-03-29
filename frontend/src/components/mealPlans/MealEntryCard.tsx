import type { MealPlanEntry } from '../../types/mealPlan';

interface MealEntryCardProps {
  entry: MealPlanEntry;
  onDelete: (entry: MealPlanEntry) => void;
  onEdit: (entry: MealPlanEntry) => void;
}

export function MealEntryCard({ entry, onDelete, onEdit }: MealEntryCardProps) {
  return (
    <div className="group relative rounded-lg border border-th-border bg-card px-3 py-2 text-sm">
      <p className="font-medium text-heading truncate pr-6">{entry.title}</p>
      {entry.recipe && (
        <p className="text-xs text-muted mt-0.5 truncate">📖 {entry.recipe.title}</p>
      )}
      {entry.servings > 1 && (
        <p className="text-xs text-faint mt-0.5">{entry.servings} servings</p>
      )}
      {entry.notes && (
        <p className="text-xs text-secondary mt-0.5 italic truncate">{entry.notes}</p>
      )}
      <div className="absolute right-1 top-1 flex gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onEdit(entry)}
          className="rounded p-0.5 text-xs text-muted hover:text-heading hover:bg-hover-bg"
          title="Edit"
          aria-label={`Edit ${entry.title}`}
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry)}
          className="rounded p-0.5 text-xs text-muted hover:text-red-500 hover:bg-hover-bg"
          title="Delete"
          aria-label={`Delete ${entry.title}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
