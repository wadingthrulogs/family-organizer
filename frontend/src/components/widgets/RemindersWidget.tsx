import { useReminders } from '../../hooks/useReminders';
import { channelLabels } from '../../types/reminder';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function RemindersWidget() {
  const { data, isLoading } = useReminders();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const reminders = data?.items ?? [];
  const activeReminders = reminders.filter((r) => r.enabled);

  const showHeader = height > 80;
  const showLink = !compact;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            🔔 {!tiny && 'Reminders'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.7em]">
              ({activeReminders.length})
            </span>
          </h2>
          {showLink && (
            <a href="/reminders" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-[0.85em] text-[var(--color-text-secondary)]">Loading…</p>
        ) : activeReminders.length === 0 ? (
          <p className="text-[0.85em] text-[var(--color-text-secondary)]">No active reminders.</p>
        ) : (
          <ul className="space-y-1 pr-0.5">
            {activeReminders.map((r) => (
              <li
                key={r.id}
                className={`flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
              >
                <span className="flex-1 text-[var(--color-text)] truncate text-[0.9em]">{r.title}</span>
                {!tiny && (
                  <span className="shrink-0 text-[0.6em] text-[var(--color-text-secondary)]">
                    {r.leadTimeMinutes}m
                  </span>
                )}
                {!compact && (
                  <span className="shrink-0 text-[0.6em] text-[var(--color-accent)]">
                    {channelLabels(r.channelMask).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
