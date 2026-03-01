import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type GroceryItemFormValues = {
  name: string;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
};

type GroceryItemFormProps = {
  initialValues?: Partial<GroceryItemFormValues>;
  submitLabel?: string;
  isSubmitting?: boolean;
  onSubmit: (values: GroceryItemFormValues) => Promise<void> | void;
  onCancel?: () => void;
};

export function GroceryItemForm({
  initialValues,
  submitLabel = 'Save item',
  isSubmitting,
  onSubmit,
  onCancel,
}: GroceryItemFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [category, setCategory] = useState(initialValues?.category ?? '');
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? 1);
  const [unit, setUnit] = useState(initialValues?.unit ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');

  useEffect(() => {
    setName(initialValues?.name ?? '');
    setCategory(initialValues?.category ?? '');
    setQuantity(initialValues?.quantity ?? 1);
    setUnit(initialValues?.unit ?? '');
    setNotes(initialValues?.notes ?? '');
  }, [initialValues?.name, initialValues?.category, initialValues?.quantity, initialValues?.unit, initialValues?.notes]);

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
      category: category.trim() ? category.trim() : null,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      unit: unit.trim() ? unit.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
    });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Item name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          placeholder="Blueberries"
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Category</label>
          <input
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            placeholder="Produce"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Quantity</label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase text-form-label">Unit</label>
          <input
            type="text"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
            placeholder="pint"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase text-form-label">Notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-lg border border-th-border px-3 py-2 text-sm"
          rows={3}
          placeholder="Organic preferred"
        />
      </div>
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
