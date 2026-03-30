import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { useChores } from '../hooks/useChores';
import { ChoreCard } from '../components/chores/ChoreCard';
import { ChoreForm, type ChoreFormValues } from '../components/chores/ChoreForm';
import { AssignmentList } from '../components/chores/AssignmentList';
import { useCreateChoreMutation, useUpdateChoreMutation, useDeleteChoreMutation, useUpdateAssignmentMutation, useSkipAssignmentMutation, useSwapAssignmentMutation } from '../hooks/useChoreMutations';
import { fetchUsers, type UserListItem } from '../api/auth';
import { fetchChoreStreaks, type ChoreStreak } from '../api/chores';
import type { Chore, ChoreAssignmentState } from '../types/chore';

function mapChoreToFormValues(chore: Chore): ChoreFormValues {
  return {
    title: chore.title,
    description: chore.description ?? undefined,
    rotationType: chore.rotationType,
    frequency: chore.frequency,
    interval: chore.interval,
    eligibleUserIds: chore.eligibleUserIds,
    rewardPoints: chore.rewardPoints,
    active: chore.active,
  };
}

function ChoresPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useChores();
  const createChore = useCreateChoreMutation();
  const updateChore = useUpdateChoreMutation();
  const deleteChore = useDeleteChoreMutation();
  const updateAssignment = useUpdateAssignmentMutation();
  const skipAssignment = useSkipAssignmentMutation();
  const swapAssignment = useSwapAssignmentMutation();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [streaks, setStreaks] = useState<Record<number, ChoreStreak[]>>({});
  const [focusMode, setFocusMode] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const chores = data?.items ?? [];

  useEffect(() => {
    fetchUsers().then((r) => setUsers(r.items)).catch(() => {});
  }, []);

  // Stable key so the streaks effect doesn't loop
  const choreKey = chores.map((c) => c.id).join(',');

  // Fetch streaks for all chores that have assignments
  useEffect(() => {
    if (!chores.length) return;
    const choreIds = chores.filter((c) => c.active && c.assignments?.length).map((c) => c.id);
    if (!choreIds.length) return;
    Promise.all(choreIds.map((id) => fetchChoreStreaks(id))).then((results) => {
      const map: Record<number, ChoreStreak[]> = {};
      for (const r of results) map[r.choreId] = r.streaks;
      setStreaks(map);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choreKey]);
  const activeCount = useMemo(() => chores.filter((chore) => chore.active).length, [chores]);
  const inactiveCount = useMemo(() => chores.length - activeCount, [chores, activeCount]);
  const errorMessage = error instanceof Error ? error.message : 'Unable to load chores right now.';
  const assignments = useMemo(() => {
    return chores.flatMap((chore) =>
      (chore.assignments ?? []).map((assignment) => ({
        ...assignment,
        choreTitle: chore.title,
        rewardPoints: chore.rewardPoints,
      }))
    );
  }, [chores]);
  const upcomingAssignments = useMemo(() => {
    return assignments
      .filter((assignment) => assignment.state !== 'COMPLETED' && assignment.state !== 'SKIPPED')
      .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())
      .slice(0, 6);
  }, [assignments]);
  const assignmentErrorMessage = updateAssignment.isError
    ? updateAssignment.error instanceof Error
      ? updateAssignment.error.message
      : 'Unable to update assignment right now.'
    : undefined;
  const loadingAssignmentId =
    updateAssignment.isPending
      ? (updateAssignment.variables as { assignmentId: number } | undefined)?.assignmentId ?? null
      : skipAssignment.isPending
      ? (skipAssignment.variables as { assignmentId: number } | undefined)?.assignmentId ?? null
      : swapAssignment.isPending
      ? (swapAssignment.variables as { assignmentId: number } | undefined)?.assignmentId ?? null
      : null;

  const handleDelete = async (choreId: number) => {
    await deleteChore.mutateAsync(choreId);
  };

  const handleUpdateChore = async (values: ChoreFormValues) => {
    if (!editingChore) return;
    await updateChore.mutateAsync({
      choreId: editingChore.id,
      data: {
        title: values.title,
        description: values.description ?? null,
        rotationType: values.rotationType,
        frequency: values.frequency,
        interval: values.interval,
        eligibleUserIds: values.eligibleUserIds,
        rewardPoints: values.rewardPoints,
        active: values.active,
      },
    });
    setEditingChore(null);
  };

  const handleCreateChore = async (values: ChoreFormValues) => {
    await createChore.mutateAsync({
      title: values.title,
      description: values.description ?? null,
      rotationType: values.rotationType,
      frequency: values.frequency,
      interval: values.interval,
      eligibleUserIds: values.eligibleUserIds,
      rewardPoints: values.rewardPoints,
      active: values.active,
    });
    setComposerOpen(false);
  };

  const handleAssignmentState = async (assignmentId: number, state: ChoreAssignmentState) => {
    await updateAssignment.mutateAsync({ assignmentId, data: { state } });
  };

  const handleSkip = async (assignmentId: number) => {
    await skipAssignment.mutateAsync({ assignmentId });
  };

  const handleSwap = async (assignmentId: number, targetUserId: number) => {
    await swapAssignment.mutateAsync({ assignmentId, targetUserId });
  };

  const eligibleUsers = useMemo(() => users.map((u) => ({ id: u.id, username: u.username })), [users]);

  const clampedFocusIndex = Math.min(focusIndex, Math.max(0, upcomingAssignments.length - 1));
  const focusAssignment = upcomingAssignments[clampedFocusIndex] ?? null;

  const handleFocusDone = async () => {
    if (!focusAssignment || updateAssignment.isPending) return;
    await handleAssignmentState(focusAssignment.id, 'COMPLETED');
  };

  const handleFocusSnooze = async () => {
    if (!focusAssignment || updateAssignment.isPending) return;
    await handleAssignmentState(focusAssignment.id, 'SNOOZED');
  };

  const handleFocusSkipAssignment = async () => {
    if (!focusAssignment || skipAssignment.isPending) return;
    await handleSkip(focusAssignment.id);
  };

  const handleFocusNext = () => setFocusIndex((i) => Math.min(i + 1, upcomingAssignments.length - 1));
  const handleFocusPrev = () => setFocusIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Chore Planner</h1>
          <p className="text-sm text-muted">Rotation engine (round-robin, weighted) with streak tracking.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            aria-pressed={focusMode}
            className={`rounded-full border px-4 py-2.5 text-sm transition ${
              focusMode
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-th-border text-muted hover:text-heading'
            }`}
            onClick={() => { setFocusMode((v) => !v); setFocusIndex(0); }}
          >
            {focusMode ? '✕ Exit focus' : '⚡ Focus mode'}
          </button>
          <button
            className="rounded-full bg-btn-primary px-4 py-2.5 text-sm text-btn-primary-text"
            onClick={() => setComposerOpen((value) => !value)}
          >
            {composerOpen ? 'Close form' : 'Add chore'}
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Active</p>
          <p className="text-3xl font-semibold text-heading">{activeCount}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Paused</p>
          <p className="text-3xl font-semibold text-heading">{inactiveCount}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total Templates</p>
          <p className="text-3xl font-semibold text-heading">{chores.length}</p>
        </article>
      </section>

      {/* Focus mode card */}
      {focusMode && (
        <section className="overflow-hidden rounded-card border-2 border-accent bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-th-border bg-accent/5 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Focus Mode</p>
            <span className="text-xs text-muted">
              {upcomingAssignments.length > 0
                ? `${clampedFocusIndex + 1} of ${upcomingAssignments.length} pending`
                : 'All done!'}
            </span>
          </div>
          {focusAssignment ? (
            <div className="space-y-4 p-5">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: focusAssignment.assignee?.colorHex ?? '#94a3b8' }}
                  >
                    {focusAssignment.assignee?.username?.slice(0, 2).toUpperCase() ?? '??'}
                  </span>
                  <span className="text-xs text-muted">{focusAssignment.assignee?.username ?? 'Unassigned'}</span>
                  {focusAssignment.rewardPoints > 0 && (
                    <span className="rounded-full border border-th-border px-2 py-0.5 text-xs text-muted">
                      {focusAssignment.rewardPoints} pts
                    </span>
                  )}
                </div>
                <p className="text-xl font-semibold text-heading">{focusAssignment.choreTitle}</p>
                <p className="mt-1 text-xs text-muted">
                  Window: {new Date(focusAssignment.windowStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' – '}
                  {new Date(focusAssignment.windowEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleFocusDone}
                disabled={updateAssignment.isPending}
                className="w-full rounded-lg bg-btn-primary py-3 text-base font-semibold text-btn-primary-text disabled:opacity-50"
              >
                {updateAssignment.isPending ? 'Saving…' : '✓ Mark Done'}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFocusSnooze}
                  disabled={focusAssignment.state === 'SNOOZED' || updateAssignment.isPending}
                  className="flex-1 rounded-lg border border-th-border py-2.5 text-sm text-secondary disabled:opacity-30"
                >
                  Snooze
                </button>
                <button
                  type="button"
                  onClick={handleFocusSkipAssignment}
                  disabled={skipAssignment.isPending}
                  className="flex-1 rounded-lg border border-red-200 py-2.5 text-sm text-red-500 disabled:opacity-30"
                >
                  Skip
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFocusPrev}
                  disabled={clampedFocusIndex === 0}
                  className="flex-1 rounded-lg border border-th-border py-2 text-sm text-muted disabled:opacity-30"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={handleFocusNext}
                  disabled={clampedFocusIndex >= upcomingAssignments.length - 1}
                  className="flex-1 rounded-lg border border-th-border py-2 text-sm text-muted disabled:opacity-30"
                >
                  Next →
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="mb-2 text-3xl">🎉</p>
              <p className="font-semibold text-heading">All caught up!</p>
              <p className="mt-1 text-sm text-muted">No pending chore assignments.</p>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="mt-4 rounded-full border border-th-border px-4 py-2 text-sm text-muted"
              >
                Exit focus mode
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-card bg-card p-5 shadow-soft">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-heading">Upcoming assignments</h2>
            <p className="text-sm text-muted">Live rotation windows pulled from the API.</p>
          </div>
          {isFetching && !isLoading ? <span className="text-xs text-faint">Refreshing…</span> : null}
        </header>
        <AssignmentList
          assignments={upcomingAssignments}
          onUpdateState={handleAssignmentState}
          onSkip={handleSkip}
          onSwap={handleSwap}
          eligibleUsers={eligibleUsers}
          isUpdatingId={loadingAssignmentId}
          errorMessage={assignmentErrorMessage}
        />
      </section>

      {/* Completion Streaks */}
      {Object.keys(streaks).length > 0 && (
        <section className="rounded-card bg-card p-5 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">🔥 Completion Streaks</h2>
            <p className="text-sm text-muted">Track consecutive completions per member.</p>
          </header>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {chores.filter((c) => streaks[c.id]?.length).map((chore) => (
              <div key={chore.id} className="rounded-card border border-th-border p-4">
                <p className="mb-2 text-sm font-semibold text-heading">{chore.title}</p>
                <div className="space-y-1">
                  {streaks[chore.id].map((s) => (
                    <div key={s.userId} className="flex items-center justify-between text-xs text-muted">
                      <span className="font-medium text-secondary">{s.username}</span>
                      <div className="flex gap-3">
                        <span title="Current streak">🔥 {s.currentStreak}</span>
                        <span title="Longest streak">🏆 {s.longestStreak}</span>
                        <span title="Total completed">✅ {s.totalCompleted}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {composerOpen ? (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">Create chore template</h2>
            <p className="text-sm text-muted">Define the cadence and eligible family members.</p>
          </header>
          <ChoreForm
            onSubmit={handleCreateChore}
            isSubmitting={createChore.isPending}
            users={users}
            errorMessage={
              createChore.isError
                ? createChore.error instanceof Error
                  ? createChore.error.message
                  : 'Unable to create chore right now.'
                : undefined
            }
          />
        </section>
      ) : null}

      {editingChore ? (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">Edit chore</h2>
            <p className="text-sm text-muted">Update cadence, rotation, or eligible members.</p>
            {updateChore.isError ? (
              <p className="mt-2 text-xs text-red-600">
                {updateChore.error instanceof Error ? updateChore.error.message : 'Unable to update chore right now.'}
              </p>
            ) : null}
          </header>
          <ChoreForm
            key={editingChore.id}
            initialValues={mapChoreToFormValues(editingChore)}
            submitLabel="Save changes"
            onSubmit={handleUpdateChore}
            onCancel={() => setEditingChore(null)}
            isSubmitting={updateChore.isPending}
            users={users}
          />
        </section>
      ) : null}

      {isError ? (
        <div className="flex items-center justify-between gap-4 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold text-red-700"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2 rounded-card border border-th-border-light bg-card p-4">
              <div className="h-4 w-1/2 rounded bg-skeleton-bright" />
              <div className="h-3 w-2/3 rounded bg-hover-bg" />
              <div className="h-3 w-1/3 rounded bg-hover-bg" />
            </div>
          ))}
        </section>
      ) : (
        <section className="rounded-card bg-card p-5 shadow-soft">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-heading">Chore templates</h2>
              <p className="text-sm text-muted">{chores.length} total chore{chores.length === 1 ? '' : 's'}.</p>
            </div>
            {isFetching && !isLoading ? (
              <span className="text-xs text-faint">Refreshing…</span>
            ) : null}
          </header>
          {chores.length === 0 ? (
            <EmptyState
              title="No chores yet."
              description="Use the Add chore button above to create your first chore rotation."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {chores.map((chore) => (
                <ChoreCard key={chore.id} chore={chore} onEdit={(c) => setEditingChore(c)} onDelete={handleDelete} users={eligibleUsers} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default ChoresPage;
