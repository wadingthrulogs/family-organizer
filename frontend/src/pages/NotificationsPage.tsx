import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  fetchNotificationLog,
  processNotifications,
  sendDigest,
  type NotificationLogEntry,
} from '../api/notifications';

const STATUS_COLORS: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-amber-100 text-amber-700',
  PENDING: 'bg-hover-bg text-secondary',
};

const CHANNEL_ICONS: Record<string, string> = {
  PUSH: '🔔',
  EMAIL: '✉️',
  WEBHOOK: '🔗',
};

export default function NotificationsPage() {
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
      {/* ─── Push Subscription Card ─── */}
      <section className="rounded-card bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="font-display text-2xl text-heading">Notifications</h1>
            <p className="text-sm text-muted">
              Manage push notifications and view delivery history.
            </p>
          </div>
        </div>

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

      {/* ─── Admin Controls ─── */}
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

      {/* ─── Notification History ─── */}
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
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[entry.status] ?? STATUS_COLORS.PENDING}`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted">
                      {entry.reminder?.title ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {formatTimestamp(entry.sentAt ?? entry.createdAt)}
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

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
