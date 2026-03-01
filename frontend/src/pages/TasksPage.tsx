import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { useTasks } from '../hooks/useTasks';
import type { Task, TaskStatus } from '../types/task';
import { TaskForm, type TaskFormValues } from '../components/tasks/TaskForm';
import { TaskCard } from '../components/tasks/TaskCard';
import {
  useCreateTaskMutation,
  useDeleteTaskMutation,
  useUpdateTaskMutation,
} from '../hooks/useTaskMutations';

type BoardStatus = Extract<TaskStatus, 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'>;

const columns: Array<{ id: BoardStatus; title: string }> = [
  { id: 'OPEN', title: 'Open' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'BLOCKED', title: 'Blocked' },
  { id: 'DONE', title: 'Done' },
];

function mapTaskToFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description ?? undefined,
    dueAt: task.dueAt ?? undefined,
    priority: task.priority,
    status: task.status,
    labels: task.labels ?? undefined,
    assigneeUserIds: task.assignments?.map((a) => a.userId) ?? [],
    recurrence: task.recurrence
      ? { frequency: task.recurrence.frequency, interval: task.recurrence.interval }
      : undefined,
  };
}

function DroppableColumn({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[4rem] rounded-card transition-colors ${isOver ? 'ring-2 ring-accent ring-offset-1' : ''}`}
    >
      {children}
    </div>
  );
}

function DraggableTask({ id, children }: { id: number; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(id) });
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? 'opacity-50 z-50 relative cursor-grabbing' : 'cursor-grab'}
    >
      {children}
    </div>
  );
}

function TasksPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useTasks();
  const createTaskMutation = useCreateTaskMutation();
  const updateTaskMutation = useUpdateTaskMutation();
  const deleteTaskMutation = useDeleteTaskMutation();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const tasks = useMemo(() => {
    return (data?.items ?? []).filter((task) => !task.deletedAt && task.status !== 'ARCHIVED');
  }, [data]);

  const grouped = useMemo(() => {
    return columns.reduce<Record<BoardStatus, Task[]>>((acc, column) => {
      acc[column.id] = tasks.filter((task) => task.status === column.id);
      return acc;
    }, {} as Record<BoardStatus, Task[]>);
  }, [tasks]);

  const totalActive = tasks.length;
  const errorMessage = error instanceof Error ? error.message : 'Unable to load tasks right now.';

  const handleCreateTask = async (values: TaskFormValues) => {
    await createTaskMutation.mutateAsync({
      title: values.title,
      description: values.description ?? null,
      dueAt: values.dueAt ?? null,
      priority: values.priority,
      status: values.status,
      labels: values.labels ?? null,
      assigneeUserIds: values.assigneeUserIds,
      recurrence: values.recurrence ?? null,
    });
    setComposerOpen(false);
  };

  const handleUpdateTask = async (values: TaskFormValues) => {
    if (!editingTask) {
      return;
    }
    await updateTaskMutation.mutateAsync({
      taskId: editingTask.id,
      data: {
        title: values.title,
        description: values.description ?? null,
        dueAt: values.dueAt ?? null,
        priority: values.priority,
        status: values.status,
        labels: values.labels ?? null,
        assigneeUserIds: values.assigneeUserIds ?? [],
      },
    });
    setEditingTask(null);
  };

  const handleDeleteTask = async (task: Task) => {
    const confirmed = window.confirm(`Delete "${task.title}"? It can be restored later from the archive.`);
    if (!confirmed) {
      return;
    }
    await deleteTaskMutation.mutateAsync(task.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const taskId = Number(active.id);
    const newStatus = over.id as BoardStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    updateTaskMutation.mutate({ taskId, data: { status: newStatus } });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Tasks</p>
          <h1 className="font-display text-2xl text-heading">Active board</h1>
          <p className="text-sm text-muted">{totalActive} task{totalActive === 1 ? '' : 's'} on deck.</p>
        </div>
        <div className="flex gap-3">
          <button className="rounded-full border border-th-border px-4 py-2 text-sm">Filters</button>
          <button
            className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
            onClick={() => setComposerOpen((value) => !value)}
          >
            {composerOpen ? 'Close Composer' : 'New Task'}
          </button>
        </div>
      </header>

      {composerOpen ? (
        <section className="rounded-card border border-th-border bg-card p-4 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">Create a task</h2>
            <p className="text-sm text-muted">Add a title, due window, and priority.</p>
            {createTaskMutation.isError ? (
              <p className="mt-2 text-xs text-red-600">
                {createTaskMutation.error instanceof Error
                  ? createTaskMutation.error.message
                  : 'Unable to create the task right now.'}
              </p>
            ) : null}
          </header>
          <TaskForm
            submitLabel="Create task"
            onSubmit={handleCreateTask}
            onCancel={() => setComposerOpen(false)}
            isSubmitting={createTaskMutation.isPending}
          />
        </section>
      ) : null}

      {editingTask ? (
        <section className="rounded-card border border-th-border bg-card p-4 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">Edit task</h2>
            <p className="text-sm text-muted">Update status, due window, or priority.</p>
            {updateTaskMutation.isError ? (
              <p className="mt-2 text-xs text-red-600">
                {updateTaskMutation.error instanceof Error
                  ? updateTaskMutation.error.message
                  : 'Unable to update the task right now.'}
              </p>
            ) : null}
          </header>
          <TaskForm
            initialValues={mapTaskToFormValues(editingTask)}
            submitLabel="Save changes"
            onSubmit={handleUpdateTask}
            onCancel={() => setEditingTask(null)}
            isSubmitting={updateTaskMutation.isPending}
          />
        </section>
      ) : null}

      {isError ? (
        <div className="flex items-center justify-between gap-4 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold text-red-700"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {columns.map((column) => (
            <section key={column.id} className="rounded-card bg-card p-4 shadow-soft">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-primary">{column.title}</h2>
                <span className="text-xs text-faint">--</span>
              </header>
              <div className="space-y-3">
                {[0, 1].map((placeholder) => (
                  <div key={placeholder} className="animate-pulse space-y-2 rounded-card border border-th-border-light p-3">
                    <div className="h-3 rounded bg-skeleton-bright" />
                    <div className="h-3 w-2/3 rounded bg-hover-bg" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 lg:grid-cols-4">
            {columns.map((column) => {
              const columnTasks = grouped[column.id] ?? [];

              return (
                <section key={column.id} className="rounded-card bg-card p-4 shadow-soft">
                  <header className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-primary">{column.title}</h2>
                    <span className="text-xs text-faint">{columnTasks.length}</span>
                  </header>
                  <DroppableColumn id={column.id}>
                    {columnTasks.length === 0 ? (
                      <p className="text-xs text-faint">No tasks yet</p>
                    ) : (
                      <div className="space-y-3">
                        {columnTasks.map((task) => (
                          <DraggableTask key={task.id} id={task.id}>
                            <TaskCard
                              task={task}
                              onEdit={(selected) => setEditingTask(selected)}
                              onDelete={handleDeleteTask}
                              isDeleting={Boolean(deleteTaskMutation.isPending && deleteTaskMutation.variables === task.id)}
                            />
                          </DraggableTask>
                        ))}
                      </div>
                    )}
                  </DroppableColumn>
                </section>
              );
            })}
          </div>
        </DndContext>
      )}

      {isFetching && !isLoading ? (
        <p className="text-center text-xs text-faint">Refreshing…</p>
      ) : null}
    </div>
  );
}

export default TasksPage;
