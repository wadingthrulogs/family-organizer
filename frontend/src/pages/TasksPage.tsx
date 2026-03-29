import { useMemo, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { TaskRow } from '../components/tasks/TaskRow';
import { useCreateTaskMutation } from '../hooks/useTaskMutations';
import { useTasks } from '../hooks/useTasks';
import { useAuth } from '../hooks/useAuth';
import { useAnnounce } from '../contexts/AnnouncementContext';
import { EmptyState } from '../components/ui/EmptyState';

type FilterTab = 'all' | 'active' | 'done' | 'mine';

interface DateGroup {
  label: string;
  tasks: Task[];
}

function getDateBucket(dueAt: string | null | undefined): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!dueAt) return 'none';
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const due = new Date(dueAt);
  if (due < todayStart) return 'overdue';
  if (due < todayEnd) return 'today';
  return 'upcoming';
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

  const [filter, setFilter] = useState<FilterTab>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const allTasks: Task[] = data?.items ?? [];

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
