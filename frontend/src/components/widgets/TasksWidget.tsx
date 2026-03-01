import { useTasks } from '../../hooks/useTasks';
import { useWidgetSize } from '../../hooks/useWidgetSize';

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-400/20 text-gray-400',
  2: 'bg-blue-400/20 text-blue-400',
  3: 'bg-amber-400/20 text-amber-500',
  4: 'bg-red-400/20 text-red-500',
  5: 'bg-red-600/20 text-red-600',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TasksWidget() {
  const { data: tasksData } = useTasks();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const tasks = tasksData?.items ?? [];
  const pendingTasks = tasks.filter(
    (t) => t.status !== 'DONE' && t.status !== 'ARCHIVED' && !t.deletedAt,
  );

  const showHeader = height > 80;
  const showLink = !compact;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            📋 {!tiny && 'Tasks'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.7em]">
              ({pendingTasks.length})
            </span>
          </h2>
          {showLink && (
            <a href="/tasks" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pendingTasks.length > 0 ? (
          <ul className="space-y-1 pr-0.5">
            {pendingTasks
              .sort((a, b) => b.priority - a.priority)
              .map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
                >
                  <span
                    className={`shrink-0 rounded-full px-1 py-0.5 text-[0.55em] font-bold ${PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS[1]}`}
                  >
                    P{t.priority}
                  </span>
                  <span className="flex-1 text-[var(--color-text)] truncate text-[0.9em]">
                    {t.title}
                  </span>
                  {t.assignments && t.assignments.length > 0 && !tiny && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[0.6em] text-[var(--color-text-secondary)]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: t.assignments[0].user.colorHex ?? '#94a3b8' }}
                      />
                      {!compact && (
                        <span className="max-w-[5em] truncate">
                          {t.assignments[0].user.username}
                          {t.assignments.length > 1 ? ` +${t.assignments.length - 1}` : ''}
                        </span>
                      )}
                    </span>
                  )}
                  {t.dueAt && !tiny && (
                    <span className="shrink-0 text-[0.6em] text-[var(--color-text-secondary)]">
                      {formatDate(t.dueAt)}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-[0.85em] text-[var(--color-text-secondary)]">All done! 🎉</p>
        )}
      </div>
    </div>
  );
}
