import { useEffect, useRef, useState } from 'react';
import { fetchUsers, type UserListItem } from '../../api/auth';
import { useTasks } from '../../hooks/useTasks';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { useCreateTaskMutation, useUpdateTaskMutation } from '../../hooks/useTaskMutations';
import { formatRelativeDate } from '../../lib/dates';

export default function TasksWidget() {
  const { data: tasksData } = useTasks();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const updateTask = useUpdateTaskMutation();
  const createTask = useCreateTaskMutation();
  const tasks = tasksData?.items ?? [];
  const pendingTasks = tasks.filter(
    (t) => t.status !== 'DONE' && t.status !== 'ARCHIVED' && !t.deletedAt,
  );

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeIds, setNewAssigneeIds] = useState<number[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUsers().then((r) => setUsers(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (showAdd) {
      setTimeout(() => titleInputRef.current?.focus(), 0);
    }
  }, [showAdd]);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await createTask.mutateAsync({
      title: newTitle.trim(),
      assigneeUserIds: newAssigneeIds.length > 0 ? newAssigneeIds : undefined,
    });
    setNewTitle('');
    setNewAssigneeIds([]);
    setShowAdd(false);
  };

  const handleCancel = () => {
    setNewTitle('');
    setNewAssigneeIds([]);
    setShowAdd(false);
  };

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
          <div className="flex items-center gap-2">
            {!tiny && (
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-accent)] text-white text-[0.8em] font-bold leading-none hover:opacity-80 transition-opacity shrink-0"
                aria-label="Add task"
              >
                +
              </button>
            )}
            {showLink && (
              <a href="/tasks" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
                View →
              </a>
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="mb-2 shrink-0 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
          <input
            ref={titleInputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') handleCancel();
            }}
            placeholder="Task title…"
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-card)] px-2 py-1 text-[0.85em] text-[var(--color-text)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)]"
          />
          {users.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {users.map((u) => {
                const selected = newAssigneeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setNewAssigneeIds((prev) =>
                        selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                    className={`rounded-full border px-2 py-0.5 text-[0.7em] font-medium transition-colors ${
                      selected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]'
                    }`}
                  >
                    {u.username}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-[var(--color-border)] px-3 py-0.5 text-[0.75em] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newTitle.trim() || createTask.isPending}
              className="rounded-full bg-[var(--color-accent)] px-3 py-0.5 text-[0.75em] text-white disabled:opacity-50 hover:opacity-80 transition-opacity"
            >
              {createTask.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
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
