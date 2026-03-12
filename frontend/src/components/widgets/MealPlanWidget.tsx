import { useMealPlans } from '../../hooks/useMealPlans';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import type { MealPlanEntry } from '../../types/mealPlan';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date) {
  return d.toISOString().split('T')[0];
}

export default function MealPlanWidget() {
  const { data, isLoading } = useMealPlans();
  const { ref, compact, tiny, height, width } = useWidgetSize();

  const plans = data?.items ?? [];
  const monday = getMonday(new Date());
  const mondayStr = toISODate(monday);
  const currentPlan = plans.find((p) => toISODate(new Date(p.weekStart)) === mondayStr);

  const showHeader = height > 80;
  const showLink = !compact;
  const showDays = height > 140 && width > 200;

  const getDinners = (): Array<{ day: string; entry: MealPlanEntry | null }> => {
    return DAY_LABELS.map((day, i) => ({
      day,
      entry: currentPlan?.entries.find((e) => e.dayOffset === i && e.mealType === 'DINNER') ?? null,
    }));
  };

  return (
    <div ref={ref} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            🍽️ {!tiny && 'Meal Plan'}
          </h2>
          {showLink && (
            <a href="/meal-plans" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">Loading…</p>
      ) : !currentPlan ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">No plan this week.</p>
      ) : showDays ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
          {getDinners().map(({ day, entry }) => (
            <div key={day} className="flex items-center gap-2">
              <span className="text-[0.65em] font-medium text-[var(--color-text-secondary)] w-[2.5em] shrink-0">{day}</span>
              <span className={`text-[0.8em] truncate ${entry ? 'text-[var(--color-text)]' : 'text-[var(--color-text-faint)]'}`}>
                {entry ? `🌙 ${entry.title}` : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">
          {currentPlan.entries.length} meal{currentPlan.entries.length !== 1 ? 's' : ''} planned
        </p>
      )}
    </div>
  );
}
