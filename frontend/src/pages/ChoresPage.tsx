import { useEffect, useMemo, useState } from 'react';
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Chore Planner</h1>
          <p className="text-sm text-muted">Rotation engine (round-robin, weighted) with streak tracking.</p>
        </div>
        <div className="flex gap-3">
          <button className="rounded-full border border-th-border px-4 py-2 text-sm">Rotation rules</button>
          <button
            className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
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
            <p className="text-sm text-muted">No chores yet. Use the button above to create one.</p>
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
