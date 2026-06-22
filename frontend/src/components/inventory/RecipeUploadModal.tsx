import { useRef, useState, type ChangeEvent } from 'react';

import { Modal } from '../ui/Modal';
import {
  useExtractInventoryFromImageMutation,
  useBulkAddInventoryStructuredMutation,
} from '../../hooks/useInventoryMutations';
import type { ExtractedInventoryItem } from '../../api/inventory';

type Row = { name: string; quantity: string; unit: string; category: string };

function toRow(it: ExtractedInventoryItem): Row {
  return {
    name: it.name,
    quantity: it.quantity != null ? String(it.quantity) : '',
    unit: it.unit ?? '',
    category: it.category ?? '',
  };
}

function errorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return msg || fallback;
}

export function RecipeUploadModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (count: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const extract = useExtractInventoryFromImageMutation();
  const addItems = useBulkAddInventoryStructuredMutation();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resetInput = () => {
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    setRows(null);
    setTitle(null);
    setError('');
    resetInput();
    onClose();
  };

  const handlePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setRows(null);
    setTitle(null);
    try {
      const result = await extract.mutateAsync(file);
      if (!result.items.length) {
        setError('No items were found in that photo. Try a clearer, well-lit image.');
        return;
      }
      setTitle(result.title);
      setRows(result.items.map(toRow));
    } catch (err) {
      setError(errorMessage(err, 'Could not analyze that photo. Please try again.'));
    } finally {
      resetInput();
    }
  };

  const updateRow = (i: number, key: keyof Row, val: string) =>
    setRows((rs) => (rs ? rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)) : rs));
  const removeRow = (i: number) => setRows((rs) => (rs ? rs.filter((_, idx) => idx !== i) : rs));
  const addRow = () => setRows((rs) => [...(rs ?? []), { name: '', quantity: '', unit: '', category: '' }]);

  const handleConfirm = async () => {
    const items: ExtractedInventoryItem[] = (rows ?? [])
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity.trim() ? Number(r.quantity) : null,
        unit: r.unit.trim() || null,
        category: r.category.trim() || null,
      }));
    if (!items.length) {
      setError('Add at least one item with a name.');
      return;
    }
    setError('');
    try {
      const res = await addItems.mutateAsync(items);
      onAdded(res.total);
      close();
    } catch (err) {
      setError(errorMessage(err, 'Failed to add items. Please try again.'));
    }
  };

  const analyzing = extract.isPending;
  const adding = addItems.isPending;

  return (
    <Modal open={open} onClose={close} title="Upload recipe photo" maxWidth="max-w-3xl">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />

      {analyzing ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-th-border border-t-accent" />
          <p className="text-sm font-medium text-heading">Analyzing photo…</p>
          <p className="text-xs text-muted">Reading the ingredients with AI — this can take up to a minute.</p>
        </div>
      ) : !rows ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted">
            Take or choose a photo of a recipe, ingredient list, or receipt. The items and amounts are
            pulled out automatically for you to review before adding to inventory.
          </p>
          <button
            type="button"
            className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text"
            onClick={() => fileRef.current?.click()}
          >
            📷 Choose photo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            {title ? <span className="font-medium text-heading">{title}: </span> : null}
            Review and edit before adding. {rows.length} item{rows.length === 1 ? '' : 's'} found.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 py-1 font-medium">Item</th>
                  <th className="w-20 px-2 py-1 font-medium">Qty</th>
                  <th className="w-24 px-2 py-1 font-medium">Unit</th>
                  <th className="w-32 px-2 py-1 font-medium">Category</th>
                  <th className="w-8 px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-th-border-light">
                    <td className="px-1 py-1">
                      <input
                        className="w-full rounded border border-th-border bg-input px-2 py-1"
                        value={r.name}
                        onChange={(e) => updateRow(i, 'name', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="w-full rounded border border-th-border bg-input px-2 py-1"
                        inputMode="decimal"
                        value={r.quantity}
                        onChange={(e) => updateRow(i, 'quantity', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="w-full rounded border border-th-border bg-input px-2 py-1"
                        value={r.unit}
                        onChange={(e) => updateRow(i, 'unit', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="w-full rounded border border-th-border bg-input px-2 py-1"
                        value={r.category}
                        onChange={(e) => updateRow(i, 'category', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        className="text-muted hover:text-red-600"
                        aria-label="Remove item"
                        onClick={() => removeRow(i)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-full border border-th-border px-3 py-1.5 text-xs text-secondary"
              onClick={addRow}
            >
              + Add row
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-full border border-th-border px-4 py-2 text-sm"
                onClick={() => {
                  setRows(null);
                  setTitle(null);
                  setError('');
                }}
              >
                Start over
              </button>
              <button
                type="button"
                className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
                disabled={adding || rows.every((r) => !r.name.trim())}
                onClick={handleConfirm}
              >
                {adding ? 'Adding…' : `Add ${rows.filter((r) => r.name.trim()).length} to inventory`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
