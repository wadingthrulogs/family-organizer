import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type GroceryListFormValues = {
  name: string;
  store?: string | null;
  presetKey?: string | null;
  isActive: boolean;
};

type GroceryListFormProps = {
  initialValues?: Partial<GroceryListFormValues>;
  submitLabel?: string;
  isSubmitting?: boolean;
  onSubmit: (values: GroceryListFormValues) => Promise<void> | void;
  onCancel?: () => void;
};

export function GroceryListForm({
  initialValues,
  submitLabel = 'Save list',
  isSubmitting,
  onSubmit,
  onCancel,
}: GroceryListFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [store, setStore] = useState(initialValues?.store ?? '');
  const [presetKey, setPresetKey] = useState(initialValues?.presetKey ?? '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);

  useEffect(() => {
    setName(initialValues?.name ?? '');
    setStore(initialValues?.store ?? '');
    setPresetKey(initialValues?.presetKey ?? '');
    setIsActive(initialValues?.isActive ?? true);
  }, [initialValues?.name, initialValues?.store, initialValues?.presetKey, initialValues?.isActive]);

  const isDisabled = useMemo(() => {
    return !name.trim() || Boolean(isSubmitting);
  }, [name, isSubmitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    await onSubmit({
      name: name.trim(),
      store: store.trim() ? store.trim() : null,
      presetKey: presetKey.trim() ? presetKey.trim() : null,
      isActive,
    });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          placeholder="Staples run"
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Store</label>
          <input
            type="text"
            value={store}
            onChange={(event) => setStore(event.target.value)}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            placeholder="Trader Joe's"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Preset</label>
          <input
            type="text"
            value={presetKey}
            onChange={(event) => setPresetKey(event.target.value)}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            placeholder="weekly-staples"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-secondary">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
        Active list
      </label>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" className="rounded-full border border-th-border px-4 py-2 text-sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-50" disabled={isDisabled}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
