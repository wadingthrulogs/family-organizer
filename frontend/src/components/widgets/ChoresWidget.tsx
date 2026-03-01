import { useChores } from '../../hooks/useChores';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function ChoresWidget() {
  const { data: choresData } = useChores();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
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
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            🧹 {!tiny && 'Chores'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.7em]">
              ({pendingChores.length})
            </span>
          </h2>
          {showLink && (
            <a href="/chores" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pendingChores.length > 0 ? (
          <ul className="space-y-1 pr-0.5">
            {pendingChores.map((c) => {
              const isOverdue = overdueIds.has(c.id);
              const currentAssignment = (c.assignments ?? [])
                .filter((a) => a.state === 'PENDING' || a.state === 'IN_PROGRESS')
                .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())[0];
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-1.5 rounded-lg border ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${
                    isOverdue
                      ? 'border-red-300 bg-red-50/60'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                  }`}
                >
                  <span className="flex-1 text-[var(--color-text)] truncate text-[0.9em]">
                    {c.title}
                  </span>
                  {currentAssignment?.assignee && !tiny && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[0.6em] text-[var(--color-text-secondary)]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: currentAssignment.assignee.colorHex ?? '#94a3b8' }}
                      />
                      {!compact && (
                        <span className="max-w-[5em] truncate">
                          {currentAssignment.assignee.username}
                        </span>
                      )}
                    </span>
                  )}
                  {!tiny && (
                    <span className="shrink-0 text-[0.6em] text-[var(--color-text-secondary)] capitalize">
                      {c.frequency.toLowerCase()}
                    </span>
                  )}
                  {isOverdue && !tiny && (
                    <span className="shrink-0 text-[0.6em] font-semibold text-red-500">Overdue</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[0.85em] text-[var(--color-text-secondary)]">All caught up! 🎉</p>
        )}
      </div>
    </div>
  );
}
