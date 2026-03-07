import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fetchUsers, type UserListItem } from '../../api/auth';

export type RecurrenceValues = {
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string | null;
  until?: string | null;
};

export type TaskFormValues = {
  title: string;
  description?: string;
  dueAt?: string | null;
  labels?: string;
  assigneeUserIds?: number[];
  recurrence?: RecurrenceValues | null;
};

function toInputValue(iso?: string | null) {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoString(value: string) {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

type TaskFormProps = {
  initialValues?: Partial<TaskFormValues>;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
};

export function TaskForm({ initialValues, onSubmit, onCancel, submitLabel, isSubmitting }: TaskFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [dueAt, setDueAt] = useState(toInputValue(initialValues?.dueAt));
  const [labels, setLabels] = useState(initialValues?.labels ?? '');
  const [assigneeIds, setAssigneeIds] = useState<number[]>(initialValues?.assigneeUserIds ?? []);
  const [showRecurrence, setShowRecurrence] = useState(!!initialValues?.recurrence);
  const [recFrequency, setRecFrequency] = useState<RecurrenceValues['frequency']>(initialValues?.recurrence?.frequency ?? 'WEEKLY');
  const [recInterval, setRecInterval] = useState(initialValues?.recurrence?.interval ?? 1);
  const [users, setUsers] = useState<UserListItem[]>([]);

  useEffect(() => {
    fetchUsers().then((r) => setUsers(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    setTitle(initialValues?.title ?? '');
    setDescription(initialValues?.description ?? '');
    setDueAt(toInputValue(initialValues?.dueAt));
    setLabels(initialValues?.labels ?? '');
    setAssigneeIds(initialValues?.assigneeUserIds ?? []);
    setShowRecurrence(!!initialValues?.recurrence);
    if (initialValues?.recurrence) {
      setRecFrequency(initialValues.recurrence.frequency);
      setRecInterval(initialValues.recurrence.interval);
    }
  }, [initialValues?.title, initialValues?.description, initialValues?.dueAt, initialValues?.labels, initialValues?.assigneeUserIds, initialValues?.recurrence]);

  const isDisabled = useMemo(() => {
    return !title.trim() || Boolean(isSubmitting);
  }, [title, isSubmitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      dueAt: toIsoString(dueAt ?? ''),
      labels: labels.trim() || undefined,
      assigneeUserIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      recurrence: showRecurrence ? { frequency: recFrequency, interval: recInterval } : null,
    });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          placeholder="What needs doing?"
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          rows={3}
          placeholder="Optional context"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Due</label>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
        />
      </div>

      {/* Labels */}
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Labels</label>
        <input
          type="text"
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          placeholder="Comma-separated labels (e.g. urgent, home)"
        />
      </div>

      {/* Assignees */}
      {users.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Assign to</label>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => {
              const selected = assigneeIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setAssigneeIds((prev) =>
                      selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-accent bg-accent text-white'
                      : 'border-th-border text-muted hover:border-accent'
                  }`}
                >
                  {u.username}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recurrence */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase text-form-label cursor-pointer">
          <input
            type="checkbox"
            checked={showRecurrence}
            onChange={(e) => setShowRecurrence(e.target.checked)}
            className="rounded"
          />
          Repeating task
        </label>
        {showRecurrence && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted">Frequency</label>
              <select
                value={recFrequency}
                onChange={(e) => setRecFrequency(e.target.value as RecurrenceValues['frequency'])}
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">Every N intervals</label>
              <input
                type="number"
                min={1}
                max={365}
                value={recInterval}
                onChange={(e) => setRecInterval(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-th-border px-4 py-2 text-sm"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
          disabled={isDisabled}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
