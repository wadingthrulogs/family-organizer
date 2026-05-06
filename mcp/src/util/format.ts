/** Returns ISO-8601 [startOfDay, endOfDay] in UTC for the given local date. */
export function dayRangeUtc(localDate: Date, timezoneOffsetMinutes = 0): { start: string; end: string } {
  // localDate represents "now" in the user's timezone; we treat its date parts as the day.
  const y = localDate.getUTCFullYear();
  const m = localDate.getUTCMonth();
  const d = localDate.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const endUtc = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
  // Apply timezone offset (positive offset = ahead of UTC; we shift backwards to UTC).
  startUtc.setUTCMinutes(startUtc.getUTCMinutes() - timezoneOffsetMinutes);
  endUtc.setUTCMinutes(endUtc.getUTCMinutes() - timezoneOffsetMinutes);
  return { start: startUtc.toISOString(), end: endUtc.toISOString() };
}

/**
 * Compute today's start/end as ISO strings interpreting "today" in the supplied
 * IANA timezone. Falls back to UTC if Intl APIs throw.
 */
export function todayBoundsInTimezone(timezone: string): { start: string; end: string; isoDate: string } {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const isoDate = fmt.format(now); // YYYY-MM-DD
    // Build local midnight + end-of-day for that date in the target tz, then convert to UTC instants.
    const start = zonedDateToUtcIso(`${isoDate}T00:00:00`, timezone);
    const end = zonedDateToUtcIso(`${isoDate}T23:59:59.999`, timezone);
    return { start, end, isoDate };
  } catch {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    return {
      start: `${isoDate}T00:00:00.000Z`,
      end: `${isoDate}T23:59:59.999Z`,
      isoDate,
    };
  }
}

/**
 * Interpret a naive ISO datetime string ("2026-05-03T08:00:00") as a wall time
 * in the given IANA timezone, and return the equivalent UTC ISO string.
 */
function zonedDateToUtcIso(naiveIso: string, timezone: string): string {
  // Strategy: take the naive timestamp, treat as UTC to get a candidate instant,
  // ask Intl what wall time that instant lands on in the target tz, and adjust by the diff.
  const asUtc = new Date(`${naiveIso}Z`);
  const tzWall = wallTimeInZone(asUtc, timezone);
  const diffMin = (asUtc.getTime() - tzWall.getTime()) / 60_000;
  return new Date(asUtc.getTime() + diffMin * 60_000).toISOString();
}

function wallTimeInZone(instant: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  // 'hour: 24' edge case: Intl may return '24' for midnight on some runtimes.
  const hour = get('hour') === 24 ? 0 : get('hour');
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
  );
}

export function pickFirst<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}
