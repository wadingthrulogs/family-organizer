import { useEffect, useState } from 'react';

/**
 * A key that changes when the local calendar day changes.
 *
 * The dashboard is a wall display that nobody interacts with for days at a
 * time. Widgets computed their date ranges once at mount, so at midnight they
 * kept showing the previous day's window until someone switched tabs and
 * forced a remount. Depending on this value gives components a reason to
 * re-render at the rollover — and because date ranges feed React Query keys,
 * the refetch follows automatically.
 *
 * Local time, not UTC: the household thinks in its own timezone, and a UTC day
 * key would roll over at 5pm here.
 */
function currentDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useToday(): string {
  const [dayKey, setDayKey] = useState(currentDayKey);

  useEffect(() => {
    let midnightTimer: number;

    // Fire just after midnight rather than exactly on it, so a slightly early
    // timer doesn't compute the old date and then wait another 24 hours.
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      midnightTimer = window.setTimeout(() => {
        setDayKey(currentDayKey());
        scheduleMidnight();
      }, next.getTime() - now.getTime());
    };
    scheduleMidnight();

    // Safety net. A ~24h setTimeout is not something to trust on a device that
    // suspends its display nightly, and background tabs get throttled. Setting
    // the same key is a no-op re-render-wise, so this costs nothing.
    const hourly = window.setInterval(() => setDayKey(currentDayKey()), 60 * 60 * 1000);

    // Catch up immediately when the display or tab becomes visible again.
    const onVisible = () => {
      if (!document.hidden) setDayKey(currentDayKey());
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(midnightTimer);
      window.clearInterval(hourly);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return dayKey;
}
