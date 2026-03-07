import { useMemo, useState, type FormEvent } from 'react';
import { useInventory } from '../hooks/useInventory';
import {
  useCreateInventoryItemMutation,
  useUpdateInventoryItemMutation,
  useDeleteInventoryItemMutation,
  useBulkAddInventoryItemsMutation,
} from '../hooks/useInventoryMutations';
import { exportInventoryTxt } from '../api/inventory';
import type { InventoryItem } from '../types/inventory';

function formatQuantity(item: InventoryItem) {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 1;
  return item.unit ? `${qty} ${item.unit}` : `${qty}`;
}

type FormState = {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  lowStockThreshold: string;
  notes: string;
  dateAdded: string;
};

const emptyForm: FormState = {
  name: '',
  category: '',
  quantity: '1',
  unit: '',
  lowStockThreshold: '',
  notes: '',
  dateAdded: new Date().toISOString().slice(0, 10),
};

function formFromItem(item: InventoryItem): FormState {
  return {
    name: item.name,
    category: item.category ?? '',
    quantity: String(item.quantity),
    unit: item.unit ?? '',
    lowStockThreshold: item.lowStockThreshold != null ? String(item.lowStockThreshold) : '',
    notes: item.notes ?? '',
    dateAdded: item.dateAdded ? item.dateAdded.slice(0, 10) : '',
  };
}

function InventoryPage() {
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useInventory(
    showLowStock ? { lowStock: true } : undefined
  );

  const createItem = useCreateInventoryItemMutation();
  const updateItem = useUpdateInventoryItemMutation();
  const deleteItem = useDeleteInventoryItemMutation();

  const bulkAdd = useBulkAddInventoryItemsMutation();

  const [composerOpen, setComposerOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkAddText, setBulkAddText] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportInventoryTxt();
    } catch {
      // Silently handle — file download failed
    } finally {
      setExporting(false);
    }
  };

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [items, search]);

  const lowStockCount = useMemo(
    () =>
      items.filter(
        (item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold
      ).length,
    [items]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set).sort();
  }, [items]);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setComposerOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setComposerOpen(false);
    setEditingItem(item);
    setForm(formFromItem(item));
  };

  const handleCancel = () => {
    setComposerOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
  };

  const handleSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createItem.mutateAsync({
      name: form.name,
      category: form.category || null,
      quantity: Number(form.quantity) || 1,
      unit: form.unit || null,
      lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : null,
      notes: form.notes || null,
      dateAdded: form.dateAdded || null,
    });
    setForm(emptyForm);
    setComposerOpen(false);
  };

  const handleSubmitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    await updateItem.mutateAsync({
      itemId: editingItem.id,
      data: {
        name: form.name,
        category: form.category || null,
        quantity: Number(form.quantity) || 1,
        unit: form.unit || null,
        lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : null,
        notes: form.notes || null,
        dateAdded: form.dateAdded || null,
      },
    });
    setEditingItem(null);
    setForm(emptyForm);
  };

  const handleDelete = async (item: InventoryItem) => {
    await deleteItem.mutateAsync(item.id);
    if (editingItem?.id === item.id) {
      setEditingItem(null);
      setForm(emptyForm);
    }
  };

  const errorMessage = error instanceof Error ? error.message : 'Unable to load inventory right now.';
  const createError = createItem.isError
    ? createItem.error instanceof Error
      ? createItem.error.message
      : 'Unable to add item.'
    : undefined;
  const updateError = updateItem.isError
    ? updateItem.error instanceof Error
      ? updateItem.error.message
      : 'Unable to update item.'
    : undefined;
  const deleteError = deleteItem.isError
    ? deleteItem.error instanceof Error
      ? deleteItem.error.message
      : 'Unable to delete item.'
    : undefined;

  const isLowStock = (item: InventoryItem) =>
    item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Inventory</h1>
          <p className="text-sm text-muted">Track what you have at home. Move items here from your grocery lists.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-sm transition ${
              showLowStock ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-th-border text-primary'
            }`}
            onClick={() => setShowLowStock((v) => !v)}
          >
            {showLowStock ? 'Show all' : `Low stock (${lowStockCount})`}
          </button>
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-primary disabled:opacity-50"
            disabled={exporting || items.length === 0}
            onClick={handleExport}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-primary"
            onClick={() => { setBulkAddOpen((v) => !v); setBulkAddText(''); setComposerOpen(false); setEditingItem(null); }}
          >
            {bulkAddOpen ? 'Close bulk add' : 'Bulk add'}
          </button>
          <button
            type="button"
            className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
            onClick={() => { setBulkAddOpen(false); composerOpen ? handleCancel() : handleOpenCreate(); }}
          >
            {composerOpen ? 'Close form' : 'Add item'}
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total Items</p>
          <p className="text-3xl font-semibold text-heading">{items.length}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Categories</p>
          <p className="text-3xl font-semibold text-heading">{categories.length}</p>
        </article>
        <article className="rounded-card border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-600">Low Stock</p>
          <p className="text-3xl font-semibold text-amber-700">{lowStockCount}</p>
        </article>
      </section>

      {composerOpen && (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold text-heading">Add to inventory</h2>
          {createError && <p className="mb-2 text-xs text-red-600">{createError}</p>}
          <InventoryForm
            form={form}
            onChange={handleChange}
            onSubmit={handleSubmitCreate}
            onCancel={handleCancel}
            submitLabel="Add item"
            isSubmitting={createItem.isPending}
          />
        </section>
      )}

      {bulkAddOpen && (
        <section className="rounded-card border border-dashed border-th-border bg-hover-bg p-5 shadow-soft">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-heading">Bulk add to inventory</h2>
            <p className="text-xs text-muted">One item per line. Supports formats like: <code>3x paper towels</code>, <code>2 bags rice</code>, <code>milk</code>, <code>batteries 4</code></p>
            {bulkAdd.isError && (
              <p className="mt-1 text-xs text-red-600">
                {bulkAdd.error instanceof Error ? bulkAdd.error.message : 'Bulk add failed'}
              </p>
            )}
          </header>
          <textarea
            className="w-full rounded-card border border-th-border px-3 py-2 text-sm"
            rows={6}
            placeholder={"3x paper towels\n2 bags rice\nmilk\nbatteries 4\n1 box trash bags"}
            value={bulkAddText}
            onChange={(e) => setBulkAddText(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-40"
              disabled={bulkAdd.isPending || !bulkAddText.trim()}
              onClick={async () => {
                await bulkAdd.mutateAsync(bulkAddText);
                setBulkAddText('');
                setBulkAddOpen(false);
              }}
            >
              {bulkAdd.isPending ? 'Adding…' : 'Add items'}
            </button>
            <button
              type="button"
              className="rounded-full border border-th-border px-4 py-2 text-sm text-secondary"
              onClick={() => { setBulkAddOpen(false); setBulkAddText(''); }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-lg rounded-card border border-th-border bg-card p-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-heading">Edit {editingItem.name}</h2>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xl leading-none text-muted hover:text-heading"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {updateError && <p className="mb-2 text-xs text-red-600">{updateError}</p>}
            <InventoryForm
              form={form}
              onChange={handleChange}
              onSubmit={handleSubmitEdit}
              onCancel={handleCancel}
              submitLabel="Save changes"
              isSubmitting={updateItem.isPending}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          className="flex-1 rounded-card border border-th-border px-3 py-2 text-sm"
          placeholder="Search inventory…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isFetching && !isLoading && <span className="text-xs text-faint">Refreshing…</span>}
      </div>

      {isError && (
        <div className="flex items-center justify-between rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => refetch()} className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold">
            Retry
          </button>
        </div>
      )}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-hover-bg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-card border border-dashed border-th-border bg-hover-bg p-6 text-sm text-muted">
          {search ? 'No items match your search.' : 'Inventory is empty. Add items manually or move them from your grocery lists.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card bg-card shadow-soft">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-faint">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Date Added</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const low = isLowStock(item);
                const isDeleting = deleteItem.isPending && deleteItem.variables === item.id;
                return (
                  <tr key={item.id} className={`border-t border-th-border-light ${low ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-heading">
                      {item.name}
                      {low && (
                        <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{item.category ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatQuantity(item)}</td>
                    <td className="px-4 py-3 text-muted">
                      {item.lowStockThreshold != null ? item.lowStockThreshold : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[200px] truncate">{item.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
                            low
                              ? 'border border-amber-300 bg-amber-100 text-amber-700'
                              : 'border border-th-border text-secondary'
                          }`}
                          disabled={updateItem.isPending}
                          onClick={() => {
                            const newThreshold = low ? null : Math.max(item.quantity, 1);
                            updateItem.mutate({ itemId: item.id, data: { lowStockThreshold: newThreshold } });
                          }}
                        >
                          {low ? '✓ Low' : 'Mark low'}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-th-border px-3 py-1 text-xs text-secondary"
                          onClick={() => handleOpenEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                          disabled={isDeleting}
                          onClick={() => handleDelete(item)}
                        >
                          {isDeleting ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default InventoryPage;

/* ─── Inline form component ─── */

function InventoryForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
}: {
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}) {
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Name *
        <input
          className="rounded-card border border-th-border px-3 py-2"
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Category
        <input
          className="rounded-card border border-th-border px-3 py-2"
          value={form.category}
          onChange={(e) => onChange('category', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Quantity
        <input
          type="number"
          min="0"
          step="any"
          className="rounded-card border border-th-border px-3 py-2"
          value={form.quantity}
          onChange={(e) => onChange('quantity', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Unit
        <input
          className="rounded-card border border-th-border px-3 py-2"
          placeholder="e.g. oz, lb, each"
          value={form.unit}
          onChange={(e) => onChange('unit', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Low stock threshold
        <input
          type="number"
          min="0"
          step="any"
          className="rounded-card border border-th-border px-3 py-2"
          placeholder="Alert when qty falls to this"
          value={form.lowStockThreshold}
          onChange={(e) => onChange('lowStockThreshold', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Notes
        <input
          className="rounded-card border border-th-border px-3 py-2"
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-form-label">
        Date Added
        <input
          type="date"
          className="rounded-card border border-th-border px-3 py-2"
          value={form.dateAdded}
          onChange={(e) => onChange('dateAdded', e.target.value)}
        />
      </label>
      <div className="md:col-span-2 flex justify-end gap-3">
        <button
          type="button"
          className="rounded-full border border-th-border px-5 py-2 text-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
          disabled={isSubmitting || !form.name.trim()}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
