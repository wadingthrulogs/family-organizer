import { FormEvent, useMemo, useState } from 'react';
import type { Chore } from '../../types/chore';
import type { UserListItem } from '../../api/auth';

export type ChoreFormValues = {
  title: string;
  description?: string;
  rotationType: Chore['rotationType'];
  frequency: string;
  interval: number;
  eligibleUserIds: number[];
  rewardPoints: number;
  active: boolean;
};

const rotationOptions: Chore['rotationType'][] = ['ROUND_ROBIN', 'WEIGHTED', 'MANUAL'];

type ChoreFormProps = {
  onSubmit: (values: ChoreFormValues) => Promise<void> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string;
  submitLabel?: string;
  initialValues?: ChoreFormValues;
  users: UserListItem[];
};

export function ChoreForm({ onSubmit, onCancel, isSubmitting, errorMessage, submitLabel, initialValues, users }: ChoreFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [rotationType, setRotationType] = useState<Chore['rotationType']>(initialValues?.rotationType ?? 'ROUND_ROBIN');
  const [frequency, setFrequency] = useState(initialValues?.frequency ?? 'WEEKLY');
  const [interval, setInterval] = useState(initialValues?.interval ?? 1);
  const [eligibleUserIds, setEligibleUserIds] = useState<number[]>(initialValues?.eligibleUserIds ?? []);
  const [rewardPoints, setRewardPoints] = useState(initialValues?.rewardPoints ?? 0);
  const [active, setActive] = useState(initialValues?.active ?? true);

  const disabled = useMemo(
    () => !title.trim() || eligibleUserIds.length === 0 || Boolean(isSubmitting),
    [title, eligibleUserIds, isSubmitting],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!eligibleUserIds.length || !title.trim()) return;

    await onSubmit({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      rotationType,
      frequency,
      interval,
      eligibleUserIds,
      rewardPoints,
      active,
    });

    if (!initialValues) {
      setTitle('');
      setDescription('');
      setRotationType('ROUND_ROBIN');
      setFrequency('WEEKLY');
      setInterval(1);
      setEligibleUserIds([]);
      setRewardPoints(0);
      setActive(true);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Title</label>
          <input
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Laundry reset"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Frequency</label>
          <select
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Interval</label>
          <input
            type="number"
            min={1}
            max={30}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            value={interval}
            onChange={(event) => setInterval(Number(event.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Rotation</label>
          <select
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            value={rotationType}
            onChange={(event) => setRotationType(event.target.value as Chore['rotationType'])}
          >
            {rotationOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Reward Points</label>
          <input
            type="number"
            min={0}
            max={100}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            value={rewardPoints}
            onChange={(event) => setRewardPoints(Number(event.target.value))}
          />
        </div>
      </div>
      {users.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Assign to</label>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => {
              const selected = eligibleUserIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setEligibleUserIds((prev) =>
                      selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-accent bg-accent text-white'
                      : 'border-th-border text-muted hover:border-accent'
                  }`}
                >
                  {u.username}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Description</label>
        <textarea
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional context"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-secondary">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active
      </label>
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel}
            className="rounded-full border border-th-border px-4 py-2 text-sm">
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50"
          disabled={disabled}
        >
          {isSubmitting ? 'Saving…' : (submitLabel ?? 'Create chore')}
        </button>
      </div>
    </form>
  );
}
