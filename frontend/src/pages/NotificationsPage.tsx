import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  fetchNotificationLog,
  processNotifications,
  sendDigest,
  type NotificationLogEntry,
} from '../api/notifications';
import { useReminders } from '../hooks/useReminders';
import {
  useCreateReminderMutation,
  useUpdateReminderMutation,
  useDeleteReminderMutation,
} from '../hooks/useReminderMutations';
import type { Reminder } from '../types/reminder';
import { TARGET_TYPES, CHANNEL_FLAGS, channelLabels, formatLeadTime } from '../types/reminder';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatDisplayDateTime } from '../lib/dates';

const CHANNEL_ICONS: Record<string, string> = {
  PUSH: '🔔',
  EMAIL: '✉️',
  WEBHOOK: '🔗',
};

// ─── Reminder form types ───────────────────────────────────────────────────────

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

// ─── Reminders tab ────────────────────────────────────────────────────────────

function RemindersContent() {
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
    setForm((prev) => ({ ...prev, channelMask: prev.channelMask ^ flag }));
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
    if (!window.confirm(`Delete reminder "${reminder.title}"?`)) return;
    await deleteReminder.mutateAsync(reminder.id);
    if (editingReminder?.id === reminder.id) {
      setEditingReminder(null);
      setForm(emptyForm);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted">Push, email, or webhook notifications with quiet hours.</p>
        <button
          type="button"
          className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
          onClick={composerOpen ? handleCancel : handleOpenCreate}
        >
          {composerOpen ? 'Close form' : 'New reminder'}
        </button>
      </div>

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

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsContent() {
  const { user } = useAuth();
  const push = usePushNotifications();
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logLoading, setLogLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadLog = useCallback(async () => {
    try {
      setLogLoading(true);
      const result = await fetchNotificationLog(100);
      setLog(result.items);
      setLogTotal(result.total);
    } catch {
      // silently fail
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const isAdmin = user?.role === 'ADMIN';

  const handleProcess = async () => {
    setProcessing(true);
    setNotice(null);
    try {
      const result = await processNotifications();
      setNotice({ tone: 'success', message: result.message });
      await loadLog();
    } catch {
      setNotice({ tone: 'error', message: 'Failed to process notifications.' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDigest = async () => {
    setProcessing(true);
    setNotice(null);
    try {
      const result = await sendDigest();
      setNotice({ tone: 'success', message: result.message });
      await loadLog();
    } catch {
      setNotice({ tone: 'error', message: 'Failed to send digest.' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Push Subscription Card */}
      <section className="rounded-card bg-card p-6 shadow-soft">
        <p className="text-sm text-muted mb-4">
          Manage push notifications and view delivery history.
        </p>

        {notice && (
          <div
            className={`mb-4 rounded border px-3 py-2 text-sm ${
              notice.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {notice.message}
          </div>
        )}

        <div className="rounded-lg border border-th-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">🔔</span>
            <div>
              <h2 className="font-semibold text-heading">Browser Push Notifications</h2>
              <p className="text-xs text-muted">
                Receive alerts for reminders, overdue tasks, and daily summaries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                push.isSubscribed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : push.state === 'denied'
                    ? 'border-red-200 bg-red-50 text-red-600'
                    : push.state === 'unsupported'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-th-border bg-hover-bg text-secondary'
              }`}
            >
              {push.state === 'loading'
                ? 'Checking…'
                : push.isSubscribed
                  ? 'Enabled'
                  : push.state === 'denied'
                    ? 'Blocked by browser'
                    : push.state === 'unsupported'
                      ? 'Not supported'
                      : 'Disabled'}
            </span>

            {push.isSupported && push.state !== 'denied' && (
              <button
                type="button"
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  push.isSubscribed
                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                    : 'bg-btn-primary text-btn-primary-text hover:bg-btn-primary-hover'
                }`}
                onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
              >
                {push.isSubscribed ? 'Disable notifications' : 'Enable notifications'}
              </button>
            )}
          </div>

          {push.state === 'denied' && (
            <p className="mt-3 text-xs text-red-500">
              Notifications are blocked. Please update your browser settings to allow notifications for this site.
            </p>
          )}

          {push.error && (
            <p className="mt-3 text-xs text-red-500">{push.error}</p>
          )}
        </div>
      </section>

      {/* Admin Controls */}
      {isAdmin && (
        <section className="rounded-card bg-card p-6 shadow-soft">
          <h2 className="font-semibold text-heading mb-3">Admin Controls</h2>
          <p className="text-xs text-muted mb-4">
            Manually trigger notification processing, escalation checks, and daily digests.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
              onClick={handleProcess}
              disabled={processing}
            >
              {processing ? 'Processing…' : 'Process All Notifications'}
            </button>
            <button
              type="button"
              className="rounded-full border border-th-border px-5 py-2 text-sm disabled:opacity-50"
              onClick={handleDigest}
              disabled={processing}
            >
              {processing ? 'Sending…' : 'Send Daily Digest'}
            </button>
          </div>
        </section>
      )}

      {/* Notification History */}
      <section className="rounded-card bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-heading">Notification History</h2>
            <p className="text-xs text-muted">
              Showing {log.length} of {logTotal} notifications.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-1.5 text-xs font-semibold text-secondary hover:bg-hover-bg"
            onClick={loadLog}
            disabled={logLoading}
          >
            {logLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {logLoading && log.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-hover-bg" />
            ))}
          </div>
        ) : log.length === 0 ? (
          <div className="rounded-lg border border-dashed border-th-border p-8 text-center">
            <p className="text-sm text-muted">No notifications yet.</p>
            <p className="text-xs text-faint mt-1">
              Notifications will appear here once reminders fire or digests are sent.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-th-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reminder</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-th-border-light">
                {log.map((entry) => (
                  <tr key={entry.id} className="hover:bg-hover-bg/50">
                    <td className="px-3 py-3">
                      <span className="text-lg" title={entry.channel}>
                        {CHANNEL_ICONS[entry.channel] ?? '📢'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-heading">{entry.title}</p>
                      {entry.body && (
                        <p className="text-xs text-muted truncate max-w-xs">{entry.body}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {entry.reminder?.title ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {formatDisplayDateTime(entry.sentAt ?? entry.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'reminders' | 'notifications';

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('reminders');

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-heading">Notifications</h1>

      {/* Tabs */}
      <div className="flex border-b border-th-border">
        {([
          ['reminders', '🔔 Reminders'],
          ['notifications', '📬 History'],
        ] as [Tab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-btn-primary text-btn-primary'
                : 'border-transparent text-muted hover:text-heading'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'reminders' && <RemindersContent />}
      {activeTab === 'notifications' && <NotificationsContent />}
    </div>
  );
}

// ─── Reminder form component ──────────────────────────────────────────────────

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
