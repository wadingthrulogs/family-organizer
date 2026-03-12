import type { MealPlan, MealPlanEntry, MealType, Recipe } from '../../types/mealPlan';
import { MealEntryCard } from './MealEntryCard';

const MEAL_TYPES: { value: MealType; label: string; icon: string }[] = [
  { value: 'BREAKFAST', label: 'Breakfast', icon: '🌅' },
  { value: 'LUNCH', label: 'Lunch', icon: '☀️' },
  { value: 'DINNER', label: 'Dinner', icon: '🌙' },
  { value: 'SNACK', label: 'Snack', icon: '🍎' },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface MealPlanGridProps {
  plan: MealPlan;
  weekDates: Date[];
  onAddEntry: (dayOffset: number, mealType: MealType) => void;
  onEditEntry: (entry: MealPlanEntry) => void;
  onDeleteEntry: (entry: MealPlanEntry) => void;
}

export function MealPlanGrid({ plan, weekDates, onAddEntry, onEditEntry, onDeleteEntry }: MealPlanGridProps) {
  const getEntries = (dayOffset: number, mealType: MealType) =>
    plan.entries.filter((e) => e.dayOffset === dayOffset && e.mealType === mealType);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-1 mb-2">
          <div /> {/* empty corner */}
          {DAY_LABELS.map((day, i) => {
            const date = weekDates[i];
            const isToday = date && date.getTime() === today.getTime();
            return (
              <div key={day} className={`text-center py-2 rounded-lg text-sm font-medium ${isToday ? 'bg-btn-primary/10 text-btn-primary' : 'text-secondary'}`}>
                <div className="font-semibold">{day}</div>
                {date && (
                  <div className="text-xs text-faint">
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Meal rows */}
        {MEAL_TYPES.map((mt) => (
          <div key={mt.value} className="grid grid-cols-[100px_repeat(7,1fr)] gap-1 mb-1">
            {/* Row label */}
            <div className="flex items-center gap-1.5 py-2 px-2">
              <span className="text-base">{mt.icon}</span>
              <span className="text-xs font-medium text-secondary">{mt.label}</span>
            </div>

            {/* Day cells */}
            {DAY_LABELS.map((_, dayOffset) => {
              const entries = getEntries(dayOffset, mt.value);
              return (
                <div
                  key={dayOffset}
                  className="min-h-[60px] rounded-lg border border-th-border-light bg-card/50 p-1 flex flex-col gap-1"
                >
                  {entries.map((entry) => (
                    <MealEntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={onEditEntry}
                      onDelete={onDeleteEntry}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onAddEntry(dayOffset, mt.value)}
                    className="rounded border border-dashed border-th-border text-faint hover:text-secondary hover:border-th-border text-xs py-1 transition-colors"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
