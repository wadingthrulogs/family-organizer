import { useState } from 'react';
import type { Task } from '../../types/task';
import { TaskForm, type TaskFormValues } from './TaskForm';
import { useUpdateTaskMutation, useDeleteTaskMutation } from '../../hooks/useTaskMutations';
import { formatRelativeDate, getDateBucket } from '../../lib/dates';

type Props = {
  task: Task;
  expanded: boolean;
  onToggleExpand: () => void;
};

function DueDatePill({ dueAt }: { dueAt: string }) {
  const bucket = getDateBucket(dueAt);
  const label = formatRelativeDate(dueAt);
  if (bucket === 'overdue') {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{label}</span>;
  }
  if (bucket === 'today') {
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
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border-2 transition-colors touch-manipulation active:scale-95 ${
            isDone
              ? 'border-accent bg-accent'
              : 'border-th-border hover:border-accent'
          }`}
          disabled={updateTask.isPending}
          aria-label={isDone ? 'Mark open' : 'Mark done'}
        >
          {isDone && (
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </button>

        {/* Title */}
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isDone ? 'text-muted line-through' : 'text-heading'}`}>
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-red-600">Delete this task?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="min-h-[44px] rounded-full bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 touch-manipulation active:scale-95"
                  disabled={deleteTask.isPending}
                >
                  {deleteTask.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[44px] rounded-full border border-th-border px-4 text-sm touch-manipulation active:scale-95"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDelete}
                className="min-h-[44px] rounded-full border border-th-border px-4 text-sm text-muted transition-colors hover:border-red-600 hover:text-red-600 touch-manipulation active:scale-95"
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
