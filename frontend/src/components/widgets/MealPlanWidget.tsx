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

function todayDayOffset(): number {
  const now = new Date();
  const day = now.getDay();
  // Monday = 0 ... Sunday = 6
  return day === 0 ? 6 : day - 1;
}

export default function MealPlanWidget() {
  const { data, isLoading } = useMealPlans();
  const { ref, compact, tiny, height, width, baseFontSize } = useWidgetSize();

  const plans = data?.items ?? [];
  const monday = getMonday(new Date());
  const mondayStr = toISODate(monday);
  const currentPlan = plans.find((p) => toISODate(new Date(p.weekStart)) === mondayStr);
  const todayIdx = todayDayOffset();

  const showHeader = height > 80;
  const showLink = !compact;
  const showDays = height > 140 && width > 200;

  const getDinners = (): Array<{ day: string; entry: MealPlanEntry | null; isToday: boolean }> => {
    return DAY_LABELS.map((day, i) => ({
      day,
      entry: currentPlan?.entries.find((e) => e.dayOffset === i && e.mealType === 'DINNER') ?? null,
      isToday: i === todayIdx,
    }));
  };

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            🍽️ {!tiny && 'Meal Plan'}
          </h2>
          {showLink && (
            <a
              href="/meal-plans"
              className="inline-flex items-center min-h-[44px] px-3 text-[0.9em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation shrink-0"
            >
              View →
            </a>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-[1em] text-[var(--color-text-secondary)]">Loading…</p>
      ) : !currentPlan ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
          <span className="text-[2em]">🍽️</span>
          <p className="text-[1em] text-[var(--color-text-secondary)]">No plan this week.</p>
        </div>
      ) : showDays ? (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {getDinners().map(({ day, entry, isToday }) => (
            <div
              key={day}
              className={`flex items-center gap-3 min-h-[40px] rounded-lg px-3 py-2 ${
                isToday
                  ? 'border-l-[4px] border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : ''
              }`}
            >
              <span
                className={`text-[0.95em] font-semibold uppercase tracking-wide w-[3em] shrink-0 ${
                  isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {day}
              </span>
              <span
                className={`text-[1em] truncate ${
                  entry
                    ? isToday
                      ? 'text-[var(--color-text)] font-semibold'
                      : 'text-[var(--color-text)]'
                    : 'text-[var(--color-text-faint)]'
                }`}
              >
                {entry ? `🌙 ${entry.title}` : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[1em] text-[var(--color-text-secondary)]">
          {currentPlan.entries.length} meal{currentPlan.entries.length !== 1 ? 's' : ''} planned
        </p>
      )}
    </div>
  );
}
