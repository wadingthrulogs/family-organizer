/**
 * Centralized status/state badge component.
 * Single source of truth for all status color mappings across the app.
 */

// ─── Color maps ───────────────────────────────────────────────────────────────

const colorMap: Record<string, string> = {
  // Task statuses
  OPEN: 'bg-hover-bg text-secondary border-th-border',
  IN_PROGRESS: 'bg-sky-100 text-sky-700 border-sky-200',
  BLOCKED: 'bg-red-100 text-red-700 border-red-200',
  DONE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ARCHIVED: 'bg-hover-bg text-faint border-th-border',

  // Chore assignment states
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  SNOOZED: 'bg-hover-bg text-muted border-th-border',
  SKIPPED: 'bg-red-50 text-red-600 border-red-200',

  // Grocery item states
  NEEDED: 'bg-rose-50 text-rose-700 border-rose-200',
  CLAIMED: 'bg-hover-bg text-secondary border-th-border',
  IN_CART: 'bg-amber-50 text-amber-700 border-amber-200',
  PURCHASED: 'bg-emerald-50 text-emerald-700 border-emerald-200',

  // Notification delivery statuses
  SENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-100 text-red-700 border-red-200',

  // User roles
  ADMIN: 'bg-purple-100 text-purple-800 border-purple-200',
  MEMBER: 'bg-blue-100 text-blue-800 border-blue-200',
  VIEWER: 'bg-hover-bg text-secondary border-th-border',
};

// Human-readable labels (falls back to the key itself)
const labelMap: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
  ARCHIVED: 'Archived',
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  SNOOZED: 'Snoozed',
  SKIPPED: 'Skipped',
  NEEDED: 'Needed',
  CLAIMED: 'Claimed',
  IN_CART: 'In Cart',
  PURCHASED: 'Purchased',
  SENT: 'Sent',
  FAILED: 'Failed',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: string;
  /** Override the display label */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const colors = colorMap[status] ?? 'bg-hover-bg text-secondary border-th-border';
  const displayLabel = label ?? labelMap[status] ?? status;

  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors} ${className}`}
    >
      {displayLabel}
    </span>
  );
}

/** Convenience: returns just the Tailwind classes for a given status (for use in non-span elements) */
export function statusColors(status: string): string {
  return colorMap[status] ?? 'bg-hover-bg text-secondary border-th-border';
}

/** Convenience: returns the human-readable label for a status */
export function statusLabel(status: string): string {
  return labelMap[status] ?? status;
}
