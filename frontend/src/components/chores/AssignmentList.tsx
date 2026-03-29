import type { ChoreAssignment, ChoreAssignmentState } from '../../types/chore';
import { StatusBadge } from '../ui/StatusBadge';
import { formatDateRange } from '../../lib/dates';

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
              <p className="text-xs text-muted">{formatDateRange(assignment.windowStart, assignment.windowEnd)}</p>
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
            <StatusBadge status={assignment.state} />
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
