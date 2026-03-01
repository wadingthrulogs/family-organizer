import { useMemo, useState, type FormEvent } from 'react';
import { useReminders } from '../hooks/useReminders';
import {
  useCreateReminderMutation,
  useUpdateReminderMutation,
  useDeleteReminderMutation,
} from '../hooks/useReminderMutations';
import type { Reminder } from '../types/reminder';
import { TARGET_TYPES, CHANNEL_FLAGS, channelLabels, formatLeadTime } from '../types/reminder';

type FormState = {
  title: string;
  message: string;
  targetType: string;
  channelMask: number;
  leadTimeMinutes: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  enabled: boolean;
};

const emptyForm: FormState = {
  title: '',
  message: '',
  targetType: 'STANDALONE',
  channelMask: CHANNEL_FLAGS.PUSH,
  leadTimeMinutes: '15',
  quietHoursStart: '',
  quietHoursEnd: '',
  enabled: true,
};

function formFromReminder(r: Reminder): FormState {
  return {
    title: r.title,
    message: r.message ?? '',
    targetType: r.targetType,
    channelMask: r.channelMask,
    leadTimeMinutes: String(r.leadTimeMinutes),
    quietHoursStart: r.quietHoursStart ?? '',
    quietHoursEnd: r.quietHoursEnd ?? '',
    enabled: r.enabled,
  };
}

function RemindersPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useReminders();
  const createReminder = useCreateReminderMutation();
  const updateReminder = useUpdateReminderMutation();
  const deleteReminder = useDeleteReminderMutation();

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const reminders = data?.items ?? [];
  const activeCount = useMemo(() => reminders.filter((r) => r.enabled).length, [reminders]);
  const mutedCount = reminders.length - activeCount;

  const errorMessage = error instanceof Error ? error.message : 'Unable to load reminders right now.';
  const createError = createReminder.isError
    ? createReminder.error instanceof Error ? createReminder.error.message : 'Unable to create reminder.'
    : undefined;
  const updateError = updateReminder.isError
    ? updateReminder.error instanceof Error ? updateReminder.error.message : 'Unable to update reminder.'
    : undefined;

  const handleChange = (key: keyof FormState, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleChannel = (flag: number) => {
    setForm((prev) => ({
      ...prev,
      channelMask: prev.channelMask ^ flag,
    }));
  };

  const handleOpenCreate = () => {
    setEditingReminder(null);
    setForm(emptyForm);
    setComposerOpen(true);
  };

  const handleOpenEdit = (reminder: Reminder) => {
    setComposerOpen(false);
    setEditingReminder(reminder);
    setForm(formFromReminder(reminder));
  };

  const handleCancel = () => {
    setComposerOpen(false);
    setEditingReminder(null);
    setForm(emptyForm);
  };

  const buildPayload = () => ({
    ownerUserId: 1,
    title: form.title,
    message: form.message || null,
    targetType: form.targetType,
    channelMask: form.channelMask || CHANNEL_FLAGS.PUSH,
    leadTimeMinutes: Number(form.leadTimeMinutes) || 0,
    quietHoursStart: form.quietHoursStart || null,
    quietHoursEnd: form.quietHoursEnd || null,
    enabled: form.enabled,
  });

  const handleSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createReminder.mutateAsync(buildPayload());
    setForm(emptyForm);
    setComposerOpen(false);
  };

  const handleSubmitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingReminder) return;
    await updateReminder.mutateAsync({ reminderId: editingReminder.id, data: buildPayload() });
    setEditingReminder(null);
    setForm(emptyForm);
  };

  const handleToggleEnabled = (reminder: Reminder) => {
    updateReminder.mutate({ reminderId: reminder.id, data: { enabled: !reminder.enabled } });
  };

  const handleDelete = async (reminder: Reminder) => {
    const confirmed = window.confirm(`Delete reminder "${reminder.title}"?`);
    if (!confirmed) return;
    await deleteReminder.mutateAsync(reminder.id);
    if (editingReminder?.id === reminder.id) {
      setEditingReminder(null);
      setForm(emptyForm);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Reminders</h1>
          <p className="text-sm text-muted">Push, email, or webhook notifications with quiet hours.</p>
        </div>
        <button
          type="button"
          className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
          onClick={composerOpen ? handleCancel : handleOpenCreate}
        >
          {composerOpen ? 'Close form' : 'New reminder'}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total</p>
          <p className="text-3xl font-semibold text-heading">{reminders.length}</p>
        </article>
        <article className="rounded-card border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-600">Active</p>
          <p className="text-3xl font-semibold text-emerald-700">{activeCount}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Muted</p>
          <p className="text-3xl font-semibold text-heading">{mutedCount}</p>
        </article>
      </section>

      {composerOpen && (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold text-heading">Create reminder</h2>
          {createError && <p className="mb-2 text-xs text-red-600">{createError}</p>}
          <ReminderForm
            form={form}
            onChange={handleChange}
            onToggleChannel={toggleChannel}
            onSubmit={handleSubmitCreate}
            onCancel={handleCancel}
            submitLabel="Create"
            isSubmitting={createReminder.isPending}
          />
        </section>
      )}

      {editingReminder && (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold text-heading">Edit {editingReminder.title}</h2>
          {updateError && <p className="mb-2 text-xs text-red-600">{updateError}</p>}
          <ReminderForm
            form={form}
            onChange={handleChange}
            onToggleChannel={toggleChannel}
            onSubmit={handleSubmitEdit}
            onCancel={handleCancel}
            submitLabel="Save changes"
            isSubmitting={updateReminder.isPending}
          />
        </section>
      )}

      {isError && (
        <div className="flex items-center justify-between rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => refetch()} className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold">
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-hover-bg" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <p className="rounded-card border border-dashed border-th-border bg-hover-bg p-6 text-sm text-muted">
          No reminders yet. Create one to get notified about tasks, chores, or anything else.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-card shadow-soft">
          {isFetching && !isLoading && (
            <div className="px-4 py-2 text-right text-xs text-faint">Refreshing…</div>
          )}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-faint">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Lead time</th>
                <th className="px-4 py-3">Quiet hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((reminder) => {
                const channels = channelLabels(reminder.channelMask);
                const isDeleting = deleteReminder.isPending && deleteReminder.variables === reminder.id;
                const quietLabel =
                  reminder.quietHoursStart && reminder.quietHoursEnd
                    ? `${reminder.quietHoursStart}–${reminder.quietHoursEnd}`
                    : '—';
                return (
                  <tr key={reminder.id} className="border-t border-th-border-light">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-heading">{reminder.title}</p>
                      {reminder.message && <p className="text-xs text-faint truncate max-w-[200px]">{reminder.message}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{reminder.targetType}</td>
                    <td className="px-4 py-3 text-muted">{channels.join(' + ') || '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatLeadTime(reminder.leadTimeMinutes)}</td>
                    <td className="px-4 py-3 text-muted">{quietLabel}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(reminder)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          reminder.enabled
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-th-border bg-hover-bg text-muted'
                        }`}
                      >
                        {reminder.enabled ? 'Active' : 'Muted'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-th-border px-3 py-1 text-xs text-secondary"
                          onClick={() => handleOpenEdit(reminder)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                          disabled={isDeleting}
                          onClick={() => handleDelete(reminder)}
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default RemindersPage;

/* ─── Inline form component ─── */

function ReminderForm({
  form,
  onChange,
  onToggleChannel,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
}: {
  form: FormState;
  onChange: (key: keyof FormState, value: string | number | boolean) => void;
  onToggleChannel: (flag: number) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}) {
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Title *
        <input
          className="rounded-card border border-th-border px-3 py-2"
          value={form.title}
          onChange={(e) => onChange('title', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Target type
        <select
          className="rounded-card border border-th-border px-3 py-2"
          value={form.targetType}
          onChange={(e) => onChange('targetType', e.target.value)}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </label>
      <label className="md:col-span-2 flex flex-col gap-1 text-sm font-semibold text-form-label">
        Message
        <input
          className="rounded-card border border-th-border px-3 py-2"
          value={form.message}
          onChange={(e) => onChange('message', e.target.value)}
          placeholder="Optional description"
        />
      </label>
      <div className="flex flex-col gap-2 text-sm font-semibold text-form-label">
        Channels
        <div className="flex gap-3">
          {Object.entries(CHANNEL_FLAGS).map(([label, flag]) => (
            <label key={flag} className="flex items-center gap-2 text-sm font-normal text-secondary">
              <input
                type="checkbox"
                checked={Boolean(form.channelMask & flag)}
                onChange={() => onToggleChannel(flag)}
              />
              {label.charAt(0) + label.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Lead time (minutes)
        <input
          type="number"
          min="0"
          max="1440"
          className="rounded-card border border-th-border px-3 py-2"
          value={form.leadTimeMinutes}
          onChange={(e) => onChange('leadTimeMinutes', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Quiet hours start
        <input
          type="time"
          className="rounded-card border border-th-border px-3 py-2"
          value={form.quietHoursStart}
          onChange={(e) => onChange('quietHoursStart', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Quiet hours end
        <input
          type="time"
          className="rounded-card border border-th-border px-3 py-2"
          value={form.quietHoursEnd}
          onChange={(e) => onChange('quietHoursEnd', e.target.value)}
        />
      </label>
      <div className="md:col-span-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-semibold text-form-label">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => onChange('enabled', e.target.checked)}
          />
          Enabled
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-th-border px-5 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
            disabled={isSubmitting || !form.title.trim()}
          >
            {isSubmitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
