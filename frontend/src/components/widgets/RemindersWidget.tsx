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
        <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            🔔 {!tiny && 'Reminders'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">
              ({activeReminders.length})
            </span>
          </h2>
          {showLink && (
            <a
              href="/reminders"
              className="inline-flex items-center min-h-[44px] px-3 text-[0.9em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation shrink-0"
            >
              View →
            </a>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-[1em] text-[var(--color-text-secondary)]">Loading…</p>
        ) : activeReminders.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">🔕</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">No active reminders.</p>
          </div>
        ) : (
          <ul className="space-y-2 pr-0.5">
            {activeReminders.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 min-h-[56px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
              >
                <span className="flex-1 text-[var(--color-text)] truncate text-[1em]">{r.title}</span>
                {!tiny && (
                  <span className="shrink-0 text-[0.85em] text-[var(--color-text-secondary)] tabular-nums">
                    {r.leadTimeMinutes}m
                  </span>
                )}
                {!compact && (
                  <span className="shrink-0 text-[0.85em] text-[var(--color-accent)]">
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
