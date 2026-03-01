import { useState } from 'react';
import type { Task } from '../../types/task';
import { TaskAttachments } from './TaskAttachments';
import { fetchTaskHistory, type TaskStatusChangeItem } from '../../api/tasks';

const STATUS_LABELS: Record<Task['status'], string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  ARCHIVED: 'Archived',
};

function formatDue(iso?: string | null) {
  if (!iso) {
    return 'No due date';
  }
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

type TaskCardProps = {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  isDeleting?: boolean;
};

export function TaskCard({ task, onEdit, onDelete, isDeleting }: TaskCardProps) {
  const [history, setHistory] = useState<TaskStatusChangeItem[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const toggleHistory = async () => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    if (!history) {
      setLoadingHistory(true);
      try {
        const result = await fetchTaskHistory(task.id);
        setHistory(result.history);
      } catch { /* ignore */ }
      setLoadingHistory(false);
    }
    setHistoryOpen(true);
  };

  return (
    <article className="space-y-2 rounded-card border border-th-border-light p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-heading">{task.title}</p>
          <p className="text-xs text-muted">{formatDue(task.dueAt)}</p>
        </div>
        <span className="rounded-full border border-th-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          P{task.priority}
        </span>
      </div>
      {task.description ? <p className="text-xs text-secondary">{task.description}</p> : null}
      {task.assignments && task.assignments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.assignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full border border-th-border px-2 py-0.5 text-[10px] text-muted"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: a.user.colorHex ?? '#888' }}
              />
              {a.user.username}
            </span>
          ))}
        </div>
      )}
      {task.labels && (
        <div className="flex flex-wrap gap-1">
          {task.labels.split(',').map((lbl) => lbl.trim()).filter(Boolean).map((lbl) => (
            <span key={lbl} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
              {lbl}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="rounded-full bg-hover-bg px-2 py-0.5 text-secondary">{STATUS_LABELS[task.status]}</span>
        <div className="flex gap-2">
          <button type="button" className="text-muted hover:text-heading" onClick={() => onEdit(task)}>
            Edit
          </button>
          <button
            type="button"
            className="text-red-500 hover:text-red-700"
            onClick={() => onDelete(task)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
      <TaskAttachments taskId={task.id} />
      {/* Status History */}
      <div className="border-t border-th-border-light pt-2">
        <button
          type="button"
          className="text-[10px] text-muted hover:text-heading"
          onClick={toggleHistory}
        >
          {loadingHistory ? 'Loading…' : historyOpen ? '▾ Hide history' : '▸ Status history'}
        </button>
        {historyOpen && history && history.length > 0 && (
          <div className="mt-1 space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-[10px] text-muted">
                <span className="font-mono">{new Date(h.createdAt).toLocaleDateString()}</span>
                <span className="rounded bg-hover-bg px-1">{h.fromStatus}</span>
                <span>→</span>
                <span className="rounded bg-hover-bg px-1">{h.toStatus}</span>
                {h.changer && <span className="text-secondary">by {h.changer.username}</span>}
              </div>
            ))}
          </div>
        )}
        {historyOpen && history && history.length === 0 && (
          <p className="mt-1 text-[10px] text-faint">No status changes recorded.</p>
        )}
      </div>
    </article>
  );
}
