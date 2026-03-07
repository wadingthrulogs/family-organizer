import { useState } from 'react';
import type { Task } from '../../types/task';
import { TaskForm, type TaskFormValues } from './TaskForm';
import { useUpdateTaskMutation, useDeleteTaskMutation } from '../../hooks/useTaskMutations';

type Props = {
  task: Task;
  expanded: boolean;
  onToggleExpand: () => void;
};

function DueDatePill({ dueAt }: { dueAt: string }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const due = new Date(dueAt);
  const label = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (due < todayStart) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{label}</span>;
  }
  if (due < todayEnd) {
    return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">{label}</span>;
  }
  return <span className="rounded-full border border-th-border bg-card px-2 py-0.5 text-xs text-muted">{label}</span>;
}

function AssigneeAvatars({ assignments }: { assignments: Task['assignments'] }) {
  if (!assignments || assignments.length === 0) return null;
  return (
    <div className="flex -space-x-1">
      {assignments.slice(0, 3).map((a) => (
        <div
          key={a.id}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[10px] font-bold text-white"
          style={{ backgroundColor: a.user?.colorHex ?? '#6366f1' }}
          title={a.user?.username ?? 'Unknown'}
        >
          {(a.user?.username ?? '?')[0].toUpperCase()}
        </div>
      ))}
      {assignments.length > 3 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-gray-400 text-[10px] font-bold text-white">
          +{assignments.length - 3}
        </div>
      )}
    </div>
  );
}

export function TaskRow({ task, expanded, onToggleExpand }: Props) {
  const updateTask = useUpdateTaskMutation();
  const deleteTask = useDeleteTaskMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDone = task.status === 'DONE';

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateTask.mutate({ taskId: task.id, data: { status: isDone ? 'OPEN' : 'DONE' } });
  };

  const handleEdit = async (values: TaskFormValues) => {
    await updateTask.mutateAsync({ taskId: task.id, data: values });
    onToggleExpand();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteTask.mutate(task.id);
  };

  return (
    <div className="overflow-hidden rounded-card border border-th-border bg-card shadow-soft">
      {/* Row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-page"
        onClick={onToggleExpand}
      >
        {/* Checkbox */}
        <button
          type="button"
          onClick={handleCheck}
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors ${
            isDone
              ? 'border-accent bg-accent'
              : 'border-th-border hover:border-accent'
          }`}
          disabled={updateTask.isPending}
          aria-label={isDone ? 'Mark open' : 'Mark done'}
        >
          {isDone && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>

        {/* Title */}
        <span className={`flex-1 text-sm font-medium ${isDone ? 'text-muted line-through' : 'text-heading'}`}>
          {task.title}
        </span>

        {/* Assignees */}
        <AssigneeAvatars assignments={task.assignments} />

        {/* Due date */}
        {task.dueAt && <DueDatePill dueAt={task.dueAt} />}

        {/* Expand chevron */}
        <svg
          className={`h-4 w-4 flex-shrink-0 text-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="space-y-4 border-t border-th-border px-4 py-4">
          {task.description && (
            <p className="text-sm text-secondary">{task.description}</p>
          )}
          <TaskForm
            initialValues={{
              title: task.title,
              description: task.description ?? '',
              dueAt: task.dueAt ?? null,
              labels: task.labels ?? '',
              assigneeUserIds: task.assignments?.map((a) => a.userId) ?? [],
              recurrence: task.recurrence ?? null,
            }}
            onSubmit={handleEdit}
            onCancel={onToggleExpand}
            submitLabel="Save changes"
            isSubmitting={updateTask.isPending}
          />
          <div className="flex justify-start">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Delete this task?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                  disabled={deleteTask.isPending}
                >
                  {deleteTask.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full border border-th-border px-3 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-muted transition-colors hover:text-red-600"
              >
                Delete task
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
