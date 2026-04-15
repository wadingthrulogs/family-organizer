import { useChores } from '../../hooks/useChores';
import { useUpdateAssignmentMutation } from '../../hooks/useChoreMutations';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import type { ChoreAssignmentState } from '../../types/chore';

export default function ChoresWidget() {
  const { data: choresData } = useChores();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const updateAssignment = useUpdateAssignmentMutation();
  const chores = choresData?.items ?? [];
  const pendingChores = chores.filter((c) => c.active);

  const nowMs = Date.now();
  const overdueIds = new Set(
    chores
      .filter((c) => c.active && c.assignments)
      .flatMap((c) =>
        (c.assignments ?? [])
          .filter((a) => a.state !== 'COMPLETED' && new Date(a.windowEnd).getTime() < nowMs)
          .map(() => c.id),
      ),
  );

  const showHeader = height > 80;
  const showLink = !compact;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            🧹 {!tiny && 'Chores'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">
              ({pendingChores.length})
            </span>
          </h2>
          {showLink && (
            <a
              href="/chores"
              className="inline-flex items-center min-h-[44px] px-3 text-[0.9em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation shrink-0"
            >
              View →
            </a>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pendingChores.length > 0 ? (
          <ul className="space-y-2 pr-0.5">
            {pendingChores.map((c) => {
              const isOverdue = overdueIds.has(c.id);
              const currentAssignment = (c.assignments ?? [])
                .filter((a) => a.state === 'PENDING' || a.state === 'IN_PROGRESS')
                .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())[0];

              const nextState: ChoreAssignmentState | null =
                currentAssignment?.state === 'PENDING'
                  ? 'IN_PROGRESS'
                  : currentAssignment?.state === 'IN_PROGRESS'
                  ? 'COMPLETED'
                  : null;
              const actionLabel =
                currentAssignment?.state === 'PENDING'
                  ? 'Start'
                  : currentAssignment?.state === 'IN_PROGRESS'
                  ? 'Done'
                  : null;

              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 min-h-[56px] rounded-xl border px-4 py-3 ${
                    isOverdue
                      ? 'border-2 border-red-500 bg-red-500/10'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                  }`}
                >
                  <span className="flex-1 text-[var(--color-text)] truncate text-[1em]">
                    {c.title}
                  </span>
                  {currentAssignment?.assignee && !tiny && (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[0.8em] font-medium text-white max-w-[7em] truncate"
                      style={{ backgroundColor: currentAssignment.assignee.colorHex ?? '#94a3b8' }}
                    >
                      {currentAssignment.assignee.username}
                    </span>
                  )}
                  {isOverdue && !tiny && (
                    <span className="shrink-0 text-[0.85em] font-semibold text-red-500">Overdue</span>
                  )}
                  {nextState && currentAssignment && (
                    <button
                      type="button"
                      onClick={() =>
                        updateAssignment.mutate({
                          assignmentId: currentAssignment.id,
                          data: { state: nextState },
                        })
                      }
                      disabled={updateAssignment.isPending}
                      className="shrink-0 min-h-[44px] px-4 text-[0.9em] rounded-xl font-medium bg-[var(--color-accent)] text-white hover:opacity-80 active:scale-95 touch-manipulation disabled:opacity-50"
                    >
                      {actionLabel}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">✨</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">All caught up!</p>
          </div>
        )}
      </div>
    </div>
  );
}
