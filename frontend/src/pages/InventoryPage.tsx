import { useMemo, useState, type FormEvent } from 'react';
import { useInventory } from '../hooks/useInventory';
import {
  useCreateInventoryItemMutation,
  useUpdateInventoryItemMutation,
  useDeleteInventoryItemMutation,
  useBulkAddInventoryItemsMutation,
} from '../hooks/useInventoryMutations';
import { useGroceryLists } from '../hooks/useGroceryLists';
import { useCreateGroceryItemMutation } from '../hooks/useGroceryMutations';
import { exportInventoryTxt } from '../api/inventory';
import type { InventoryItem } from '../types/inventory';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { useAnnounce } from '../contexts/AnnouncementContext';
import { toDateInputValue } from '../lib/dates';

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
  dateAdded: toDateInputValue(),
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

type SortCol = 'name' | 'category' | 'quantity' | 'dateAdded';

function InventoryPage() {
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useInventory(
    showLowStock ? { lowStock: true } : undefined
  );

  const createItem = useCreateInventoryItemMutation();
  const updateItem = useUpdateInventoryItemMutation();
  const deleteItem = useDeleteInventoryItemMutation();
  const bulkAdd = useBulkAddInventoryItemsMutation();
  const announce = useAnnounce();
  const { data: groceryData } = useGroceryLists();
  const groceryLists = groceryData?.items ?? [];
  const createGroceryItem = useCreateGroceryItemMutation();
  const [addToGroceryItemId, setAddToGroceryItemId] = useState<number | null>(null);

  const loadingQtyItemId = updateItem.isPending
    ? (updateItem.variables as { itemId: number } | undefined)?.itemId ?? null
    : null;

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
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
    let result = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.category && item.category.toLowerCase().includes(q))
      );
    }
    if (activeCategory !== null) {
      result = result.filter((item) => item.category === activeCategory);
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sort.col) {
        case 'name':      cmp = a.name.localeCompare(b.name); break;
        case 'category':  cmp = (a.category ?? '').localeCompare(b.category ?? ''); break;
        case 'quantity':  cmp = a.quantity - b.quantity; break;
        case 'dateAdded': cmp = (a.dateAdded ?? '').localeCompare(b.dateAdded ?? ''); break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [items, search, activeCategory, sort]);

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

  const handleSort = (col: SortCol) =>
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    );

  const handleOpenCreate = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setComposerOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setComposerOpen(false);
    setEditingItem(item);
    setForm(formFromItem(item));
    setEditingCategoryId(null);
    setCategoryDraft('');
  };

  const handleCancel = () => {
    setComposerOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setEditingCategoryId(null);
    setCategoryDraft('');
  };

  const handleCategoryEditStart = (item: InventoryItem) => {
    setEditingCategoryId(item.id);
    setCategoryDraft(item.category ?? '');
  };

  const handleCategoryEditCommit = (item: InventoryItem) => {
    const trimmed = categoryDraft.trim();
    if (trimmed !== (item.category ?? '')) {
      updateItem.mutate({ itemId: item.id, data: { category: trimmed || null } });
    }
    setEditingCategoryId(null);
    setCategoryDraft('');
  };

  const handleCategoryEditCancel = () => {
    setEditingCategoryId(null);
    setCategoryDraft('');
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
    announce(`${form.name} added to inventory.`);
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
    announce(`${form.name} updated.`);
    setEditingItem(null);
    setForm(emptyForm);
  };

  const handleDelete = async (item: InventoryItem) => {
    await deleteItem.mutateAsync(item.id);
    setConfirmDeleteId(null);
    announce(`${item.name} removed from inventory.`);
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

  const SortIndicator = ({ col }: { col: SortCol }) =>
    sort.col === col ? (
      <span className="ml-1 text-accent">{sort.dir === 'asc' ? '↑' : '↓'}</span>
    ) : (
      <span className="ml-1 opacity-30">↕</span>
    );

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
            title="Add multiple items at once using plain text — one item per line"
            onClick={() => { setBulkAddOpen((v) => !v); setBulkAddText(''); setComposerOpen(false); setEditingItem(null); }}
          >
            {bulkAddOpen ? 'Close' : '+ Add multiple'}
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
            <h2 className="text-sm font-semibold text-heading">Add multiple items</h2>
            <p className="text-xs text-muted">Type one item per line in plain English — quantities, units, and names are parsed automatically.</p>
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

      <Modal
        open={editingItem !== null}
        onClose={handleCancel}
        title={editingItem ? `Edit ${editingItem.name}` : 'Edit item'}
        maxWidth="max-w-2xl"
      >
        {updateError && <p className="mb-2 text-xs text-red-600">{updateError}</p>}
        <InventoryForm
          form={form}
          onChange={handleChange}
          onSubmit={handleSubmitEdit}
          onCancel={handleCancel}
          submitLabel="Save changes"
          isSubmitting={updateItem.isPending}
        />
      </Modal>

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

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
              activeCategory === null
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-th-border text-muted hover:bg-hover-bg'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                activeCategory === cat
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-th-border text-muted hover:bg-hover-bg'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

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
        <EmptyState
          title={search || activeCategory ? 'No items match your filters.' : 'Inventory is empty.'}
          description={search || activeCategory ? undefined : 'Add items manually or move them from your grocery lists.'}
          action={!search && !activeCategory ? { label: 'Add item', onClick: handleOpenCreate } : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-card bg-card shadow-soft">
          <datalist id="category-options">
            {categories.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-faint">
                <th
                  className="cursor-pointer select-none px-4 py-3 hover:text-heading"
                  onClick={() => handleSort('name')}
                >
                  Item <SortIndicator col="name" />
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 hover:text-heading"
                  onClick={() => handleSort('category')}
                >
                  Category <SortIndicator col="category" />
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 hover:text-heading"
                  onClick={() => handleSort('quantity')}
                >
                  Qty <SortIndicator col="quantity" />
                </th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const low = isLowStock(item);
                const isDeleting = deleteItem.isPending && deleteItem.variables === item.id;
                return (
                  <tr key={item.id} className="border-t border-th-border-light">
                    <td className="px-4 py-3 font-semibold text-heading">
                      {item.name}
                      {low && (
                        <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingCategoryId === item.id ? (
                        <input
                          autoFocus
                          list="category-options"
                          value={categoryDraft}
                          onChange={(e) => setCategoryDraft(e.target.value)}
                          onBlur={() => handleCategoryEditCommit(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleCategoryEditCommit(item); }
                            else if (e.key === 'Escape') { e.preventDefault(); handleCategoryEditCancel(); }
                          }}
                          className="w-full rounded border border-accent bg-input px-2 py-0.5 text-sm text-heading outline-none focus:ring-1 focus:ring-accent"
                        />
                      ) : item.category ? (
                        <button
                          type="button"
                          onClick={() => handleCategoryEditStart(item)}
                          className="text-sm text-muted hover:text-heading hover:underline"
                        >
                          {item.category}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCategoryEditStart(item)}
                          className="text-xs text-faint hover:text-muted"
                        >
                          + category
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={loadingQtyItemId === item.id || item.quantity <= 0}
                          className="flex h-8 w-8 items-center justify-center rounded border border-th-border text-xs text-muted disabled:opacity-40 hover:bg-hover-bg"
                          onClick={() =>
                            updateItem.mutate({ itemId: item.id, data: { quantity: Math.max(0, item.quantity - 1) } })
                          }
                        >
                          −
                        </button>
                        <span className={`min-w-[2.5rem] text-center text-sm text-muted ${loadingQtyItemId === item.id ? 'opacity-50' : ''}`}>
                          {formatQuantity(item)}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={loadingQtyItemId === item.id}
                          className="flex h-8 w-8 items-center justify-center rounded border border-th-border text-xs text-muted disabled:opacity-40 hover:bg-hover-bg"
                          onClick={() =>
                            updateItem.mutate({ itemId: item.id, data: { quantity: item.quantity + 1 } })
                          }
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {item.lowStockThreshold != null ? item.lowStockThreshold : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted max-w-[200px] truncate">{item.notes ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={`rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-40 ${
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
                        {/* Add to grocery list */}
                        {groceryLists.length > 0 && (
                          <div className="relative">
                            <button
                              type="button"
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                              title="Add to a grocery list"
                              onClick={() => setAddToGroceryItemId(addToGroceryItemId === item.id ? null : item.id)}
                            >
                              + List
                            </button>
                            {addToGroceryItemId === item.id && (
                              <>
                                <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-card border border-th-border bg-card shadow-soft">
                                  {groceryLists.map((list) => (
                                    <button
                                      key={list.id}
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-xs text-heading hover:bg-hover-bg"
                                      onClick={async () => {
                                        await createGroceryItem.mutateAsync({ listId: list.id, data: { name: item.name } });
                                        setAddToGroceryItemId(null);
                                        announce(`${item.name} added to ${list.name}.`);
                                      }}
                                    >
                                      {list.name}
                                    </button>
                                  ))}
                                </div>
                                <div className="fixed inset-0 z-10" onClick={() => setAddToGroceryItemId(null)} />
                              </>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          className="rounded-full border border-th-border px-3 py-2 text-xs text-secondary"
                          onClick={() => handleOpenEdit(item)}
                        >
                          Edit
                        </button>
                        {confirmDeleteId === item.id ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded-full border border-red-500 bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                              disabled={isDeleting}
                              onClick={() => handleDelete(item)}
                            >
                              {isDeleting ? 'Removing…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-th-border px-2 py-2 text-xs text-muted"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              ✕
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(item.id)}
                          >
                            Remove
                          </button>
                        )}
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
