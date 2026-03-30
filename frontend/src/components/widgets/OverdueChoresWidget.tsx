import { useChores } from '../../hooks/useChores';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function OverdueChoresWidget() {
  const { data: choresData } = useChores();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const chores = choresData?.items ?? [];

  const nowMs = Date.now();
  const overdueChoreAssignments = chores
    .filter((c) => c.active && c.assignments)
    .flatMap((c) =>
      (c.assignments ?? [])
        .filter((a) => a.state !== 'COMPLETED' && new Date(a.windowEnd).getTime() < nowMs)
        .map((a) => ({ choreTitle: c.title, ...a })),
    );

  if (overdueChoreAssignments.length === 0) {
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex items-center justify-center">
        <p className="text-[var(--color-text-secondary)] text-[0.9em]">✅ {!tiny && 'No overdue chores!'}</p>
      </div>
    );
  }

  const showLink = !compact;
  const showList = height > 80;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl border border-red-300 bg-red-50/80 p-3 h-full overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[1.1em]">⚠️</span>
        <h3 className="font-semibold text-red-700 text-[1em]">
          {overdueChoreAssignments.length} Overdue{!tiny && (overdueChoreAssignments.length > 1 ? ' Chores' : ' Chore')}
        </h3>
        {showLink && (
          <a
            href="/chores"
            className="ml-auto shrink-0 rounded-full border border-red-300 px-2 py-1 text-[0.65em] font-semibold text-red-700 hover:bg-red-100 transition-colors"
          >
            View
          </a>
        )}
      </div>
      {showList && (
        <ul className="mt-1.5 space-y-0.5 flex-1 min-h-0 overflow-y-auto">
          {overdueChoreAssignments.map((a, i) => (
            <li key={i} className="text-red-600 flex items-center gap-1.5 text-[0.8em]">
              <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
              <span className="truncate">{a.choreTitle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
