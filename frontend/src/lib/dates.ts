/**
 * Centralized date formatting utilities.
 * All date display in the app should go through these functions.
 */

/** Returns midnight of the current day (local time) */
function todayStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Classifies an ISO date string into a display bucket.
 * Used for task grouping, due-date pill colors, etc.
 */
export type DateBucket = 'overdue' | 'today' | 'upcoming' | 'none';

export function getDateBucket(dueAt: string | null | undefined): DateBucket {
  if (!dueAt) return 'none';
  const start = todayStart();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const due = new Date(dueAt);
  if (due < start) return 'overdue';
  if (due < end) return 'today';
  return 'upcoming';
}

/**
 * Short display date: "Today", "Tomorrow", "Yesterday", or "Jan 15".
 * Used for due dates on task rows and widgets.
 */
export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const start = todayStart();
  const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const yesterday = new Date(start.getTime() - 24 * 60 * 60 * 1000);

  if (d.toDateString() === start.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';

  // Within current year: "Jan 15"
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
  }
  // Different year: "Jan 15, 2024"
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/**
 * Short locale date: "Jan 15" (no year within current year, "Jan 15, 2024" otherwise).
 * Used for assignment windows, history items, etc.
 */
export function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

/**
 * Medium date + short time: "Jan 15, 2025, 9:30 AM".
 * Used for notification logs, audit events, timestamps.
 */
export function formatDisplayDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Date range: "Jan 5 → Jan 12".
 * Used for chore assignment windows.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDisplayDate(startIso)} → ${formatDisplayDate(endIso)}`;
}

/**
 * YYYY-MM-DD string from a Date (for date input values).
 */
export function toDateInputValue(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
