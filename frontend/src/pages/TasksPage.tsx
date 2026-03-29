import { useMemo, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { TaskRow } from '../components/tasks/TaskRow';
import { useCreateTaskMutation, useUpdateTaskMutation } from '../hooks/useTaskMutations';
import { useTasks } from '../hooks/useTasks';
import { useAuth } from '../hooks/useAuth';
import { useAnnounce } from '../contexts/AnnouncementContext';
import { EmptyState } from '../components/ui/EmptyState';
import { formatRelativeDate, getDateBucket } from '../lib/dates';

type FilterTab = 'all' | 'active' | 'done' | 'mine';

interface DateGroup {
  label: string;
  tasks: Task[];
}

function groupTasks(tasks: Task[]): DateGroup[] {
  const buckets: Record<string, Task[]> = { overdue: [], today: [], upcoming: [], none: [] };
  for (const t of tasks) {
    buckets[getDateBucket(t.dueAt)].push(t);
  }
  const groups: DateGroup[] = [];
  if (buckets.overdue.length) groups.push({ label: 'Overdue', tasks: buckets.overdue });
  if (buckets.today.length) groups.push({ label: 'Today', tasks: buckets.today });
  if (buckets.upcoming.length) groups.push({ label: 'Upcoming', tasks: buckets.upcoming });
  if (buckets.none.length) groups.push({ label: 'No Due Date', tasks: buckets.none });
  return groups;
}

export default function TasksPage() {
  const { user } = useAuth();
  const { data, isLoading } = useTasks();
  const createTask = useCreateTaskMutation();
  const announce = useAnnounce();

  const updateTask = useUpdateTaskMutation();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allTasks: Task[] = data?.items ?? [];

  const focusItems = useMemo(
    () => allTasks.filter((t) => t.status !== 'DONE' && t.status !== 'ARCHIVED'),
    [allTasks]
  );
  const clampedFocusIndex = Math.min(focusIndex, Math.max(0, focusItems.length - 1));
  const focusTask = focusItems[clampedFocusIndex] ?? null;

  const handleFocusDone = async () => {
    if (!focusTask || updateTask.isPending) return;
    await updateTask.mutateAsync({ taskId: focusTask.id, data: { status: 'DONE' } });
    announce(`"${focusTask.title}" marked done.`);
  };

  const handleFocusSkip = () => setFocusIndex((i) => Math.min(i + 1, focusItems.length - 1));
  const handleFocusPrev = () => setFocusIndex((i) => Math.max(i - 1, 0));

  const filtered = useMemo(() => {
    return allTasks.filter((t) => {
      if (t.status === 'ARCHIVED') return false;
      if (filter === 'active') return t.status !== 'DONE';
      if (filter === 'done') return t.status === 'DONE';
      if (filter === 'mine') return t.assignments?.some((a) => a.userId === user?.id) ?? false;
      return true;
    });
  }, [allTasks, filter, user?.id]);

  const groups = useMemo(() => groupTasks(filtered), [filtered]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickAdd.trim();
    if (!title) return;
    setQuickAdd('');
    await createTask.mutateAsync({ title });
    announce(`Task "${title}" added.`);
    inputRef.current?.focus();
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'done', label: 'Done' },
    { id: 'mine', label: 'Mine' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-heading">Tasks</h1>
        <button
          type="button"
          aria-pressed={focusMode}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            focusMode
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-th-border text-muted hover:text-heading'
          }`}
          onClick={() => { setFocusMode((v) => !v); setFocusIndex(0); }}
        >
          {focusMode ? '✕ Exit focus' : '⚡ Focus mode'}
        </button>
      </div>

      {/* Quick-add bar */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          placeholder="+ Add a task and press Enter..."
          className="flex-1 rounded-lg border border-th-border bg-input-bg px-4 py-2.5 text-sm shadow-soft outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={!quickAdd.trim() || createTask.isPending}
          className="rounded-lg bg-btn-primary px-4 py-2.5 text-sm font-medium text-btn-primary-text disabled:opacity-50"
        >
          {createTask.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-th-border bg-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              filter === tab.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-heading'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Focus mode card */}
      {focusMode && (
        <section className="overflow-hidden rounded-card border-2 border-accent bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-th-border bg-accent/5 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Focus Mode</p>
            <span className="text-xs text-muted">
              {focusItems.length > 0
                ? `${clampedFocusIndex + 1} of ${focusItems.length} active`
                : 'All done!'}
            </span>
          </div>
          {focusTask ? (
            <div className="space-y-4 p-5">
              <div>
                {focusTask.dueAt && (
                  <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    getDateBucket(focusTask.dueAt) === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : getDateBucket(focusTask.dueAt) === 'today'
                      ? 'bg-orange-100 text-orange-700'
                      : 'border border-th-border bg-card text-muted'
                  }`}>
                    {formatRelativeDate(focusTask.dueAt)}
                  </span>
                )}
                <p className="text-xl font-semibold text-heading">{focusTask.title}</p>
                {focusTask.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{focusTask.description}</p>
                )}
                {focusTask.assignments && focusTask.assignments.length > 0 && (
                  <p className="mt-1 text-xs text-faint">
                    Assigned: {focusTask.assignments.map((a) => a.user?.username ?? 'Unknown').join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleFocusDone}
                disabled={updateTask.isPending}
                className="w-full rounded-lg bg-btn-primary py-3 text-base font-semibold text-btn-primary-text disabled:opacity-50"
              >
                {updateTask.isPending ? 'Saving…' : '✓ Mark Done'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFocusPrev}
                  disabled={clampedFocusIndex === 0}
                  className="flex-1 rounded-lg border border-th-border py-2.5 text-sm text-secondary disabled:opacity-30"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={handleFocusSkip}
                  disabled={clampedFocusIndex >= focusItems.length - 1}
                  className="flex-1 rounded-lg border border-th-border py-2.5 text-sm text-secondary disabled:opacity-30"
                >
                  Skip →
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="mb-2 text-3xl">🎉</p>
              <p className="font-semibold text-heading">All caught up!</p>
              <p className="mt-1 text-sm text-muted">No active tasks remaining.</p>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="mt-4 rounded-full border border-th-border px-4 py-2 text-sm text-muted"
              >
                Exit focus mode
              </button>
            </div>
          )}
        </section>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted">Loading tasks…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          title={filter === 'mine' ? 'No tasks assigned to you.' : 'No tasks yet.'}
          description={filter === 'mine' ? undefined : 'Add a task using the field above.'}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                group.label === 'Overdue'
                  ? 'text-red-500'
                  : group.label === 'Today'
                  ? 'text-orange-500'
                  : 'text-muted'
              }`}>
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    onToggleExpand={() => toggleExpand(task.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
