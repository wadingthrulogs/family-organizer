import type { Chore } from '../../types/chore';

const rotationLabels: Record<Chore['rotationType'], string> = {
  ROUND_ROBIN: 'Round Robin',
  WEIGHTED: 'Weighted',
  MANUAL: 'Manual',
};

type ChoreCardProps = {
  chore: Chore;
  onEdit?: (chore: Chore) => void;
  onDelete?: (choreId: number) => void;
  users?: Array<{ id: number; username: string }>;
};

export function ChoreCard({ chore, onEdit, onDelete, users }: ChoreCardProps) {
  return (
    <article className="space-y-2 rounded-card border border-th-border-light p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-heading">{chore.title}</p>
          <p className="text-xs text-muted">{rotationLabels[chore.rotationType]}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-th-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {chore.active ? 'Active' : 'Paused'}
          </span>
          {onEdit ? (
            <button type="button" onClick={() => onEdit(chore)}
              className="rounded-full border border-th-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted hover:border-accent hover:text-accent transition-colors">
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${chore.title}"? This cannot be undone.`)) {
                  onDelete(chore.id);
                }
              }}
              className="rounded-full border border-red-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-500 hover:border-red-500 transition-colors"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {chore.description ? <p className="text-xs text-secondary">{chore.description}</p> : null}
      <dl className="grid grid-cols-2 gap-3 text-xs text-muted">
        <div>
          <dt className="uppercase tracking-wide text-[10px]">Frequency</dt>
          <dd className="font-semibold text-heading">
            Every {chore.interval} {chore.frequency.toLowerCase()}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-[10px]">Eligible Users</dt>
          <dd className="font-semibold text-heading">
            {users
              ? chore.eligibleUserIds.map((id) => users.find((u) => u.id === id)?.username ?? String(id)).join(', ')
              : chore.eligibleUserIds.join(', ')}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-[10px]">Reward</dt>
          <dd className="font-semibold text-heading">{chore.rewardPoints} pts</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-[10px]">Updated</dt>
          <dd>{new Date(chore.updatedAt).toLocaleDateString()}</dd>
        </div>
      </dl>
    </article>
  );
}
