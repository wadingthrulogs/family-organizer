import { useTasks } from '../../hooks/useTasks';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { useUpdateTaskMutation } from '../../hooks/useTaskMutations';
import { formatRelativeDate } from '../../lib/dates';

export default function TasksWidget() {
  const { data: tasksData } = useTasks();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const updateTask = useUpdateTaskMutation();
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
            {pendingTasks.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
                >
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={() => updateTask.mutate({ taskId: t.id, data: { status: 'DONE' } })}
                    disabled={updateTask.isPending}
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded border-2 border-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors group"
                    aria-label="Mark done"
                  >
                    <svg className="h-3.5 w-3.5 opacity-30 group-hover:opacity-100 text-[var(--color-text-secondary)] group-hover:text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  </button>
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
                      {formatRelativeDate(t.dueAt)}
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
