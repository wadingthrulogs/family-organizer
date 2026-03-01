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

  // Scale time font relative to available space — use width as primary driver
  // since time is a horizontal string
  const timeFontSize = Math.max(14, Math.min(72, width * 0.14, height * 0.35));

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-2 text-center flex flex-col items-center justify-center h-full overflow-hidden">
      <span
        style={{ fontSize: `${timeFontSize}px` }}
        className="font-bold text-[var(--color-text)] font-mono tracking-wide leading-none"
      >
        {timeStr}
      </span>
      {showDate && (
        <span className="text-[0.75em] text-[var(--color-text-secondary)] mt-1 leading-tight truncate">
          {now.toLocaleDateString(undefined, compact
            ? { month: 'short', day: 'numeric' }
            : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
          )}
        </span>
      )}
    </div>
  );
}
