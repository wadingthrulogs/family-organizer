import { useState, useEffect } from 'react';
import { useWidgetSize } from '../../hooks/useWidgetSize';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function ClockWidget() {
  const now = useClock();
  const { ref, width, height, compact, tiny, baseFontSize } = useWidgetSize();

  const showSeconds = !tiny;
  const timeStr = showSeconds
    ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const showDate = height > 100;

  // Reserve ~40px of vertical space for the date row so the time never
  // overflows it. Constrain by both axes so the string fits whether the
  // widget is tall-and-narrow or wide-and-short.
  const timeFontSize = Math.max(14, Math.min(width * 0.14, (height - 40) * 0.5));

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-2 text-center flex flex-col items-center justify-center h-full overflow-hidden">
      <span
        style={{ fontSize: `${timeFontSize}px`, fontVariantNumeric: 'tabular-nums' }}
        className="font-bold text-[var(--color-text)] font-mono tracking-wide leading-none"
      >
        {timeStr}
      </span>
      {showDate && (
        <span className="text-[1.1em] font-medium text-[var(--color-text-secondary)] mt-2 leading-tight truncate">
          {now.toLocaleDateString(undefined, compact
            ? { month: 'short', day: 'numeric' }
            : { weekday: 'long', month: 'long', day: 'numeric' }
          )}
        </span>
      )}
    </div>
  );
}
