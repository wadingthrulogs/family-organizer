import type { ChoreAssignment, ChoreAssignmentState } from '../../types/chore';

export type AssignmentListItem = ChoreAssignment & {
  choreTitle: string;
  rewardPoints: number;
};

type AssignmentListProps = {
  assignments: AssignmentListItem[];
  onUpdateState: (assignmentId: number, state: ChoreAssignmentState) => void;
  onSkip?: (assignmentId: number) => void;
  onSwap?: (assignmentId: number, targetUserId: number) => void;
  eligibleUsers?: Array<{ id: number; username: string }>;
  isUpdatingId?: number | null;
  errorMessage?: string;
};

const stateStyles: Record<ChoreAssignmentState, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-sky-100 text-sky-700 border-sky-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  SNOOZED: 'bg-hover-bg text-muted border-th-border',
  SKIPPED: 'bg-red-50 text-red-600 border-red-200',
};

function formatRange(startIso: string, endIso: string) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const start = formatter.format(new Date(startIso));
  const end = formatter.format(new Date(endIso));
  return `${start} → ${end}`;
}

function formatAssignee(assignment: AssignmentListItem) {
  if (assignment.assignee) {
    return assignment.assignee.username;
  }
  if (assignment.userId) {
    return `User ${assignment.userId}`;
  }
  return 'Unassigned';
}

export function AssignmentList({ assignments, onUpdateState, onSkip, onSwap, eligibleUsers, isUpdatingId, errorMessage }: AssignmentListProps) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted">No upcoming assignments. Create a chore template to get started.</p>;
  }

  return (
    <div className="space-y-3">
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      {assignments.map((assignment) => {
        const isDone = assignment.state === 'COMPLETED' || assignment.state === 'SKIPPED';
        return (
        <article key={assignment.id} className="rounded-card border border-th-border-light bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-heading">{assignment.choreTitle}</p>
              <p className="text-xs text-muted">{formatRange(assignment.windowStart, assignment.windowEnd)}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: assignment.assignee?.colorHex ?? '#94a3b8' }}
                >
                  {assignment.assignee?.username?.slice(0, 2).toUpperCase() ?? '??'}
                </span>
                <span>{formatAssignee(assignment)}</span>
              </div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${stateStyles[assignment.state]}`}>
              {assignment.state}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full border border-th-border px-2 py-0.5">{assignment.rewardPoints} pts</span>
            {assignment.notes ? <span className="rounded-full border border-th-border px-2 py-0.5">{assignment.notes}</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
              disabled={isDone || isUpdatingId === assignment.id}
              onClick={() => onUpdateState(assignment.id, 'COMPLETED')}
            >
              {assignment.state === 'COMPLETED'
                ? 'Completed'
                : isUpdatingId === assignment.id
                ? 'Marking…'
                : 'Mark done'}
            </button>
            <button
              type="button"
              className="rounded-full border border-th-border px-4 py-2 text-sm text-secondary disabled:opacity-50"
              disabled={assignment.state === 'SNOOZED' || isDone || isUpdatingId === assignment.id}
              onClick={() => onUpdateState(assignment.id, 'SNOOZED')}
            >
              {assignment.state === 'SNOOZED' ? 'Snoozed' : 'Snooze'}
            </button>
            {onSkip && (
              <button
                type="button"
                className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-50"
                disabled={isDone || isUpdatingId === assignment.id}
                onClick={() => onSkip(assignment.id)}
              >
                Skip
              </button>
            )}
            {onSwap && eligibleUsers && eligibleUsers.length > 1 && !isDone && (
              <select
                className="appearance-none cursor-pointer rounded-full border border-th-border px-4 py-2 text-sm text-secondary disabled:opacity-50"
                defaultValue=""
                disabled={isUpdatingId === assignment.id}
                onChange={(e) => {
                  if (e.target.value) {
                    onSwap(assignment.id, Number(e.target.value));
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>Swap to…</option>
                {eligibleUsers
                  .filter((u) => u.id !== assignment.userId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
              </select>
            )}
          </div>
        </article>
      );
      })}
    </div>
  );
}
