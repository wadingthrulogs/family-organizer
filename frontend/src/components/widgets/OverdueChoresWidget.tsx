import { useChores } from '../../hooks/useChores';
import { useUpdateAssignmentMutation } from '../../hooks/useChoreMutations';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function OverdueChoresWidget() {
  const { data: choresData } = useChores();
  const { ref, tiny, height, baseFontSize } = useWidgetSize();
  const updateAssignment = useUpdateAssignmentMutation();
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
      <div
        ref={ref}
        style={{ fontSize: baseFontSize }}
        className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/20 p-3 h-full overflow-hidden flex flex-col items-center justify-center text-center gap-2"
      >
        <span className="text-[2.5em]">✨</span>
        <p className="text-[1em] font-semibold text-emerald-600 dark:text-emerald-400">
          All caught up!
        </p>
      </div>
    );
  }

  const showList = height > 180;

  return (
    <div
      ref={ref}
      style={{ fontSize: baseFontSize }}
      className="rounded-2xl border-4 border-red-500 bg-red-500/10 p-4 h-full overflow-hidden flex flex-col"
    >
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <span className="text-[2.5em] leading-none">⚠️</span>
        <div className="min-w-0">
          <p className="text-[2.5em] font-black text-red-500 leading-none tabular-nums">
            {overdueChoreAssignments.length}
          </p>
          <p className="text-[0.95em] font-semibold text-red-500 uppercase tracking-wide">
            Overdue
          </p>
        </div>
        {!tiny && (
          <a
            href="/chores"
            className="ml-auto inline-flex items-center min-h-[44px] px-4 text-[0.9em] font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors touch-manipulation shrink-0"
          >
            View
          </a>
        )}
      </div>
      {showList && (
        <ul className="flex-1 min-h-0 overflow-y-auto space-y-2">
          {overdueChoreAssignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 min-h-[48px] rounded-xl bg-white/70 dark:bg-black/30 px-3 py-2"
            >
              <span className="flex-1 text-[0.95em] text-[var(--color-text)] truncate">
                {a.choreTitle}
              </span>
              <button
                type="button"
                onClick={() =>
                  updateAssignment.mutate({ assignmentId: a.id, data: { state: 'COMPLETED' } })
                }
                disabled={updateAssignment.isPending}
                className="shrink-0 min-h-[44px] px-3 text-[0.85em] font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 active:scale-95 touch-manipulation disabled:opacity-50"
              >
                Resolve
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
