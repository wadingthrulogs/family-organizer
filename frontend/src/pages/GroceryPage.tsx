import { useMemo, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge, statusLabel } from '../components/ui/StatusBadge';
import { useGroceryLists } from '../hooks/useGroceryLists';
import {
  useCreateGroceryItemMutation,
  useCreateGroceryListMutation,
  useUpdateGroceryListMutation,
  useDeleteGroceryItemMutation,
  useDeleteGroceryListMutation,
  useUpdateGroceryItemMutation,
  useBulkAddGroceryItemsMutation,
  useAddLowStockToGroceryMutation,
} from '../hooks/useGroceryMutations';
import { useMoveGroceryToInventoryMutation, useMoveGroceryListToInventoryMutation } from '../hooks/useInventoryMutations';
import { GroceryListForm, type GroceryListFormValues } from '../components/grocery/GroceryListForm';
import { GroceryItemForm, type GroceryItemFormValues } from '../components/grocery/GroceryItemForm';
import type { GroceryItem, GroceryItemState } from '../types/grocery';


const shoppingStateOrder: Record<GroceryItemState, number> = {
  NEEDED: 0,
  IN_CART: 1,
  CLAIMED: 2,
  PURCHASED: 3,
};

type ShoppingItem = GroceryItem & { listName: string; listId: number };

function formatQuantity(item: GroceryItem) {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 1;
  return item.unit ? `${qty} ${item.unit}` : `${qty}`;
}

function GroceryPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGroceryLists();
  const createList = useCreateGroceryListMutation();
  const updateList = useUpdateGroceryListMutation();
  const createItem = useCreateGroceryItemMutation();
  const updateItem = useUpdateGroceryItemMutation();
  const deleteList = useDeleteGroceryListMutation();
  const deleteItem = useDeleteGroceryItemMutation();
  const moveToInventory = useMoveGroceryToInventoryMutation();
  const moveListToInventory = useMoveGroceryListToInventoryMutation();
  const bulkAdd = useBulkAddGroceryItemsMutation();
  const addLowStock = useAddLowStockToGroceryMutation();
  const [shoppingMode, setShoppingMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [listComposerOpen, setListComposerOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [itemComposerListId, setItemComposerListId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<{ listId: number; item: GroceryItem } | null>(null);
  const [bulkAddListId, setBulkAddListId] = useState<number | null>(null);
  const [bulkAddText, setBulkAddText] = useState('');
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<number | null>(null);
  const [confirmDeleteItemKey, setConfirmDeleteItemKey] = useState<string | null>(null);
  const [openMenuListId, setOpenMenuListId] = useState<number | null>(null);
  const [sortByCategoryListId, setSortByCategoryListId] = useState<Set<number>>(new Set());

  const lists = data?.items ?? [];
  const allItems = useMemo(() => lists.flatMap((list) => list.items ?? []), [lists]);
  const shoppingItems = useMemo<ShoppingItem[]>(() => {
    return lists
      .flatMap((list) =>
        (list.items ?? [])
          .filter((item) => {
            if (item.state !== 'NEEDED' && item.state !== 'IN_CART') return false;
            if (activeCategory && item.category !== activeCategory) return false;
            return true;
          })
          .map((item) => ({ ...item, listName: list.name, listId: list.id }))
      )
      .sort((a, b) => {
        if (shoppingStateOrder[a.state] !== shoppingStateOrder[b.state]) {
          return shoppingStateOrder[a.state] - shoppingStateOrder[b.state];
        }
        return a.name.localeCompare(b.name);
      });
  }, [lists, activeCategory]);
  const totalItems = allItems.length;
  const neededCount = useMemo(() => allItems.filter((item) => item.state === 'NEEDED').length, [allItems]);
  const inCartCount = useMemo(() => allItems.filter((item) => item.state === 'IN_CART').length, [allItems]);
  const purchasedCount = useMemo(() => allItems.filter((item) => item.state === 'PURCHASED').length, [allItems]);
  const categories = useMemo(
    () => [...new Set(allItems.map((i) => i.category).filter(Boolean) as string[])].sort(),
    [allItems],
  );
  const errorMessage = error instanceof Error ? error.message : 'Unable to load grocery lists right now.';
  const updateErrorMessage = updateItem.isError
    ? updateItem.error instanceof Error
      ? updateItem.error.message
      : 'Unable to update the grocery item right now.'
    : undefined;
  const pendingKey = updateItem.isPending && updateItem.variables
    ? `${updateItem.variables.listId}:${updateItem.variables.itemId}`
    : undefined;
  const deletingListId = deleteList.isPending ? deleteList.variables ?? null : null;
  const deletingItemKey = deleteItem.isPending && deleteItem.variables
    ? `${deleteItem.variables.listId}:${deleteItem.variables.itemId}`
    : null;
  const movingItemKey = moveToInventory.isPending && moveToInventory.variables
    ? `${moveToInventory.variables.groceryListId}:${moveToInventory.variables.groceryItemId}`
    : null;

  const updateListErrorMessage = updateList.isError
    ? updateList.error instanceof Error
      ? updateList.error.message
      : 'Unable to update the grocery list right now.'
    : undefined;
  const listComposerError = createList.isError
    ? createList.error instanceof Error
      ? createList.error.message
      : 'Unable to create the grocery list right now.'
    : undefined;
  const itemComposerError = createItem.isError
    ? createItem.error instanceof Error
      ? createItem.error.message
      : 'Unable to save the grocery item right now.'
    : undefined;
  const deleteListErrorMessage = deleteList.isError
    ? deleteList.error instanceof Error
      ? deleteList.error.message
      : 'Unable to delete the grocery list right now.'
    : undefined;
  const deleteItemErrorMessage = deleteItem.isError
    ? deleteItem.error instanceof Error
      ? deleteItem.error.message
      : 'Unable to delete the grocery item right now.'
    : undefined;

  const handleStateChange = (listId: number, itemId: number, state: GroceryItemState) => {
    updateItem.mutate({ listId, itemId, data: { state } });
  };

  const handleOpenListEditor = (listId: number) => {
    setEditingListId((current) => (current === listId ? null : listId));
  };

  const handleUpdateList = async (listId: number, values: GroceryListFormValues) => {
    await updateList.mutateAsync({
      listId,
      data: {
        name: values.name,
        store: values.store ?? null,
        presetKey: values.presetKey ?? null,
        isActive: values.isActive,
      },
    });
    setEditingListId(null);
  };

  const handleCreateList = async (values: GroceryListFormValues) => {
    await createList.mutateAsync({
      name: values.name,
      store: values.store ?? null,
      presetKey: values.presetKey ?? null,
      isActive: values.isActive,
    });
    setListComposerOpen(false);
  };

  const handleCreateItem = async (listId: number, values: GroceryItemFormValues) => {
    await createItem.mutateAsync({
      listId,
      data: {
        name: values.name,
        category: values.category ?? null,
        quantity: values.quantity,
        unit: values.unit ?? null,
        notes: values.notes ?? null,
      },
    });
    setItemComposerListId(null);
  };

  const handleUpdateItemDetails = async (listId: number, item: GroceryItem, values: GroceryItemFormValues) => {
    await updateItem.mutateAsync({
      listId,
      itemId: item.id,
      data: {
        name: values.name,
        category: values.category ?? null,
        quantity: values.quantity,
        unit: values.unit ?? null,
        notes: values.notes ?? null,
      },
    });
    setEditingItem(null);
  };

  const handleOpenItemComposer = (listId: number) => {
    setItemComposerListId((current) => (current === listId ? null : listId));
    setEditingItem(null);
    setBulkAddListId(null);
  };

  const handleOpenBulkAdd = (listId: number) => {
    setBulkAddListId((current) => (current === listId ? null : listId));
    setItemComposerListId(null);
    setEditingItem(null);
    setBulkAddText('');
  };

  const handleBulkAdd = async (listId: number) => {
    if (!bulkAddText.trim()) return;
    await bulkAdd.mutateAsync({ listId, text: bulkAddText });
    setBulkAddListId(null);
    setBulkAddText('');
  };

  const handleEditItem = (listId: number, item: GroceryItem) => {
    setEditingItem({ listId, item });
    setItemComposerListId(null);
  };

  const handleDeleteList = async (listId: number) => {
    await deleteList.mutateAsync(listId);
    setConfirmDeleteListId(null);
    if (itemComposerListId === listId) setItemComposerListId(null);
    if (editingItem?.listId === listId) setEditingItem(null);
  };

  const handleDeleteItem = async (listId: number, item: GroceryItem) => {
    await deleteItem.mutateAsync({ listId, itemId: item.id });
    setConfirmDeleteItemKey(null);
    if (editingItem && editingItem.item.id === item.id) setEditingItem(null);
  };

  const handleExportList = () => {
    const lines: string[] = [];
    for (const list of lists) {
      lines.push(`── ${list.name}${list.store ? ` (${list.store})` : ''} ──`);
      const needed = (list.items ?? []).filter((i: GroceryItem) => i.state === 'NEEDED' || i.state === 'IN_CART');
      if (needed.length === 0) {
        lines.push('  (no items needed)');
      } else {
        for (const item of needed) {
          const qty = Number.isFinite(item.quantity) ? item.quantity : 1;
          const unit = item.unit ? ` ${item.unit}` : '';
          lines.push(`  • ${item.name}  —  ${qty}${unit}`);
        }
      }
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopping-list-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-heading">Grocery Lists</h1>
          <p className="text-sm text-muted">Mobile shopping mode with live sync and presets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-primary disabled:opacity-40"
            onClick={handleExportList}
            disabled={lists.length === 0}
          >
            Export list
          </button>
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-sm transition ${
              shoppingMode ? 'border-btn-primary bg-btn-primary text-btn-primary-text' : 'border-th-border text-primary'
            }`}
            aria-pressed={shoppingMode}
            onClick={() => setShoppingMode((value) => !value)}
          >
            {shoppingMode ? 'Exit shopping mode' : 'Shopping mode'}
          </button>
          <button
            className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text"
            onClick={() => setListComposerOpen((value) => !value)}
          >
            {listComposerOpen ? 'Close form' : 'New list'}
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total Lists</p>
          <p className="text-3xl font-semibold text-heading">{lists.length}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Needed</p>
          <p className="text-3xl font-semibold text-heading">{neededCount}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">In Cart</p>
          <p className="text-3xl font-semibold text-heading">{inCartCount}</p>
        </article>
        <article className="rounded-card border border-th-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Purchased</p>
          <p className="text-3xl font-semibold text-heading">{purchasedCount}</p>
        </article>
      </section>

      {categories.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted">Filter by category:</span>
            {activeCategory && (
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="text-xs text-accent hover:underline"
              >
                Filtering: {activeCategory} — clear
              </button>
            )}
          </div>
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
        </div>
      )}

      {shoppingMode ? (
        <section className="rounded-card bg-shopping-bg p-5 text-shopping-text shadow-soft">
          <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-shopping-muted">Shopping Mode</p>
              <h2 className="text-xl font-semibold">Live cart view</h2>
              <p className="text-sm text-shopping-muted">Filters down to NEEDED + IN CART so phones stay uncluttered.</p>
            </div>
            <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">
              {shoppingItems.length} item{shoppingItems.length === 1 ? '' : 's'} queued
            </span>
          </header>
          {shoppingItems.length === 0 ? (
            <p className="text-sm text-shopping-muted">All caught up! Add new items or exit shopping mode.</p>
          ) : (
            <div className="space-y-3">
              {shoppingItems.map((item) => {
                const isUpdating = pendingKey === `${item.listId}:${item.id}`;
                return (
                  <div
                    key={`${item.listId}-${item.id}`}
                    className="flex flex-col gap-2 rounded-2xl bg-white/5 p-4 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-shopping-muted">
                        {item.listName}
                        {item.category ? ` • ${item.category}` : ''}
                        {' '}
                        • {formatQuantity(item)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/30 px-3 py-1 text-xs font-semibold">
                        {statusLabel(item.state)}
                      </span>
                      <button
                        type="button"
                        className="rounded-full border border-white/40 px-3 py-2.5 text-xs text-shopping-text disabled:opacity-40"
                        disabled={item.state === 'IN_CART' || item.state === 'PURCHASED' || isUpdating}
                        onClick={() => handleStateChange(item.listId, item.id, 'IN_CART')}
                      >
                        {isUpdating && updateItem.variables?.data?.state === 'IN_CART' ? 'Updating…' : 'Move to cart'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-card px-3 py-2.5 text-xs font-semibold text-heading disabled:opacity-40"
                        disabled={item.state === 'PURCHASED' || isUpdating}
                        onClick={() => handleStateChange(item.listId, item.id, 'PURCHASED')}
                      >
                        {isUpdating && updateItem.variables?.data?.state === 'PURCHASED' ? 'Saving…' : 'Purchased'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {listComposerOpen ? (
        <section className="rounded-card border border-th-border bg-card p-5 shadow-soft">
          <header className="mb-4">
            <h2 className="font-semibold text-heading">Create grocery list</h2>
            <p className="text-sm text-muted">Name the run, optionally link it to a preset, and mark it active.</p>
            {listComposerError ? <p className="text-xs text-red-600">{listComposerError}</p> : null}
          </header>
          <GroceryListForm
            submitLabel="Save list"
            isSubmitting={createList.isPending}
            onSubmit={handleCreateList}
            onCancel={() => setListComposerOpen(false)}
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

      {updateErrorMessage ? <p className="text-sm text-red-600">{updateErrorMessage}</p> : null}
      {deleteListErrorMessage ? <p className="text-sm text-red-600">{deleteListErrorMessage}</p> : null}
      {deleteItemErrorMessage ? <p className="text-sm text-red-600">{deleteItemErrorMessage}</p> : null}

      {isLoading ? (
        <section className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-3 rounded-card border border-th-border bg-card p-5">
              <div className="h-4 w-1/2 rounded bg-skeleton-bright" />
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-3 rounded bg-hover-bg" />
              ))}
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-heading">Shopping queue</h2>
              <p className="text-sm text-muted">{totalItems} item{totalItems === 1 ? '' : 's'} across all active lists.</p>
            </div>
            {isFetching && !isLoading ? <span className="text-xs text-faint">Refreshing…</span> : null}
          </header>
          {lists.length === 0 ? (
            <EmptyState
              title="No grocery lists yet."
              description="Create a list to start tracking your shopping."
              action={{ label: 'New list', onClick: () => setListComposerOpen(true) }}
            />
          ) : (
            <div className="space-y-5">
              {lists.map((list) => {
                const allListItems = list.items ?? [];
                const filteredListItems = activeCategory
                  ? allListItems.filter((i) => i.category === activeCategory)
                  : allListItems;
                const isSortedByCategory = sortByCategoryListId.has(list.id);
                const items = isSortedByCategory
                  ? [...filteredListItems].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name))
                  : filteredListItems;
                const composerOpen = itemComposerListId === list.id;
                const editingTarget = editingItem && editingItem.listId === list.id ? editingItem.item : null;
                const isCreatePendingForList = createItem.isPending && createItem.variables?.listId === list.id;
                const createErrorForList = composerOpen && createItem.variables?.listId === list.id ? itemComposerError : undefined;
                const isEditingPending = Boolean(
                  editingTarget && pendingKey === `${list.id}:${editingTarget.id}` && updateItem.isPending
                );
                const deleteListErrorForCard =
                  deleteListErrorMessage && deleteList.variables === list.id ? deleteListErrorMessage : undefined;
                const purchasedNotMoved = items.filter((i) => i.state === 'PURCHASED' && !i.movedToInventoryAt);
                const isMovingList = moveListToInventory.isPending && moveListToInventory.variables?.groceryListId === list.id;
                return (
                  <article key={list.id} className="rounded-card bg-card p-5 shadow-soft">
                    <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="font-semibold text-heading">{list.name}</h3>
                        <p className="text-xs text-muted">
                          {list.store ? `${list.store} • ` : ''}Created {new Date(list.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-faint">
                        <span className="shrink-0">{items.length} item{items.length === 1 ? '' : 's'}</span>
                        {/* Primary action always visible */}
                        <button
                          type="button"
                          className="rounded-full border border-th-border px-3 py-2 text-xs text-primary"
                          onClick={() => handleOpenItemComposer(list.id)}
                        >
                          {composerOpen ? 'Close' : 'Add item'}
                        </button>
                        {/* Secondary actions: visible on md+, hidden behind menu on mobile */}
                        <div className="hidden md:flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                              isSortedByCategory
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-th-border text-muted hover:bg-hover-bg'
                            }`}
                            onClick={() => setSortByCategoryListId((prev) => {
                              const next = new Set(prev);
                              if (next.has(list.id)) next.delete(list.id);
                              else next.add(list.id);
                              return next;
                            })}
                          >
                            {isSortedByCategory ? '↕ Sorted by category' : '↕ Sort by category'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-40"
                            disabled={addLowStock.isPending && addLowStock.variables === list.id}
                            onClick={() => addLowStock.mutate(list.id)}
                          >
                            {addLowStock.isPending && addLowStock.variables === list.id ? 'Adding…' : 'Add low stock'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-2 text-xs text-primary"
                            title="Add multiple items at once using plain text — one item per line"
                            onClick={() => handleOpenBulkAdd(list.id)}
                          >
                            {bulkAddListId === list.id ? 'Close' : '+ Add multiple'}
                          </button>
                          {purchasedNotMoved.length > 0 && (
                            <button
                              type="button"
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                              disabled={isMovingList}
                              onClick={() => moveListToInventory.mutate({ groceryListId: list.id })}
                            >
                              {isMovingList ? 'Moving…' : `Move all to Inventory (${purchasedNotMoved.length})`}
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-2 text-xs text-primary"
                            onClick={() => handleOpenListEditor(list.id)}
                          >
                            {editingListId === list.id ? 'Cancel edit' : 'Edit list'}
                          </button>
                          {confirmDeleteListId === list.id ? (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded-full border border-red-500 bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                disabled={deletingListId === list.id}
                                onClick={() => handleDeleteList(list.id)}
                              >
                                {deletingListId === list.id ? 'Deleting…' : 'Confirm delete'}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-th-border px-3 py-2 text-xs text-muted"
                                onClick={() => setConfirmDeleteListId(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                              disabled={deletingListId === list.id}
                              onClick={() => setConfirmDeleteListId(list.id)}
                            >
                              Delete list
                            </button>
                          )}
                        </div>
                        {/* Mobile kebab menu */}
                        <div className="relative md:hidden">
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-2 text-xs text-primary"
                            aria-label="More actions"
                            onClick={() => setOpenMenuListId(openMenuListId === list.id ? null : list.id)}
                          >
                            ···
                          </button>
                          {openMenuListId === list.id && (
                            <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-card border border-th-border bg-card shadow-soft">
                              <button
                                type="button"
                                className="block w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-hover-bg"
                                onClick={() => {
                                  setSortByCategoryListId((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(list.id)) next.delete(list.id);
                                    else next.add(list.id);
                                    return next;
                                  });
                                  setOpenMenuListId(null);
                                }}
                              >
                                {isSortedByCategory ? '↕ Unsort' : '↕ Sort by category'}
                              </button>
                              <button
                                type="button"
                                className="block w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-hover-bg"
                                onClick={() => { handleOpenBulkAdd(list.id); setOpenMenuListId(null); }}
                              >
                                + Add multiple
                              </button>
                              <button
                                type="button"
                                className="block w-full px-4 py-2.5 text-left text-xs text-amber-700 hover:bg-hover-bg disabled:opacity-40"
                                disabled={addLowStock.isPending && addLowStock.variables === list.id}
                                onClick={() => { addLowStock.mutate(list.id); setOpenMenuListId(null); }}
                              >
                                {addLowStock.isPending && addLowStock.variables === list.id ? 'Adding…' : 'Add low stock items'}
                              </button>
                              {purchasedNotMoved.length > 0 && (
                                <button
                                  type="button"
                                  className="block w-full px-4 py-2.5 text-left text-xs text-emerald-700 hover:bg-hover-bg disabled:opacity-40"
                                  disabled={isMovingList}
                                  onClick={() => { moveListToInventory.mutate({ groceryListId: list.id }); setOpenMenuListId(null); }}
                                >
                                  {isMovingList ? 'Moving…' : `Move all to Inventory (${purchasedNotMoved.length})`}
                                </button>
                              )}
                              <button
                                type="button"
                                className="block w-full px-4 py-2.5 text-left text-xs text-primary hover:bg-hover-bg"
                                onClick={() => { handleOpenListEditor(list.id); setOpenMenuListId(null); }}
                              >
                                Edit list
                              </button>
                              <button
                                type="button"
                                className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-red-700 hover:bg-hover-bg border-t border-th-border-light"
                                onClick={() => { setConfirmDeleteListId(list.id); setOpenMenuListId(null); }}
                              >
                                Delete list
                              </button>
                            </div>
                          )}
                          {openMenuListId === list.id && (
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuListId(null)} />
                          )}
                        </div>
                      </div>
                    </header>
                    {deleteListErrorForCard ? <p className="text-xs text-red-600">{deleteListErrorForCard}</p> : null}
                    {editingListId === list.id ? (
                      <div className="mb-4 rounded-lg border border-th-border bg-hover-bg p-4">
                        <h4 className="mb-3 text-sm font-semibold text-heading">Edit list</h4>
                        {updateListErrorMessage ? (
                          <p className="mb-2 text-xs text-red-600">{updateListErrorMessage}</p>
                        ) : null}
                        <GroceryListForm
                          initialValues={{ name: list.name, store: list.store, presetKey: list.presetKey, isActive: list.isActive }}
                          submitLabel="Save changes"
                          isSubmitting={updateList.isPending && updateList.variables?.listId === list.id}
                          onSubmit={(values) => handleUpdateList(list.id, values)}
                          onCancel={() => setEditingListId(null)}
                        />
                      </div>
                    ) : null}
                    {items.length === 0 ? (
                      <p className="text-sm text-muted">No items yet. Add something from your preset or pantry.</p>
                    ) : (
                      <>
                        {/* Mobile card layout */}
                        <div className="md:hidden space-y-2">
                          {items.map((item) => {
                            const isUpdating = pendingKey === `${list.id}:${item.id}`;
                            const isDeleting = deletingItemKey === `${list.id}:${item.id}`;
                            const isMoving = movingItemKey === `${list.id}:${item.id}`;
                            return (
                              <div key={item.id} className="rounded-lg border border-th-border-light bg-hover-bg p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div>
                                    <p className="font-semibold text-heading text-sm">{item.name}</p>
                                    <p className="text-xs text-muted">
                                      {formatQuantity(item)}{item.category ? ` · ${item.category}` : ''}
                                    </p>
                                  </div>
                                  <StatusBadge status={item.state} />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    className="rounded-full border border-th-border px-3 py-1.5 text-xs text-secondary disabled:opacity-40"
                                    disabled={isUpdating || isDeleting || isMoving}
                                    onClick={() => handleEditItem(list.id, item)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full border border-th-border px-3 py-1.5 text-xs text-primary disabled:opacity-40"
                                    disabled={item.state === 'IN_CART' || item.state === 'PURCHASED' || isUpdating || isDeleting || isMoving}
                                    onClick={() => handleStateChange(list.id, item.id, 'IN_CART')}
                                  >
                                    {isUpdating && updateItem.variables?.data?.state === 'IN_CART' ? 'Updating…' : 'In cart'}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full bg-btn-primary px-3 py-1.5 text-xs text-btn-primary-text disabled:opacity-40"
                                    disabled={item.state === 'PURCHASED' || isUpdating || isDeleting || isMoving}
                                    onClick={() => handleStateChange(list.id, item.id, 'PURCHASED')}
                                  >
                                    {isUpdating && updateItem.variables?.data?.state === 'PURCHASED' ? 'Saving…' : 'Purchased'}
                                  </button>
                                  {item.state === 'PURCHASED' && item.movedToInventoryAt && (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-600">
                                      ✓ In Inventory
                                    </span>
                                  )}
                                  {item.state === 'PURCHASED' && !item.movedToInventoryAt && (
                                    <button
                                      type="button"
                                      className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                                      disabled={isMoving || isDeleting}
                                      onClick={() => moveToInventory.mutate({ groceryItemId: item.id, groceryListId: list.id })}
                                    >
                                      {isMoving ? 'Moving…' : '→ Inventory'}
                                    </button>
                                  )}
                                  {confirmDeleteItemKey === `${list.id}:${item.id}` ? (
                                    <span className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        className="rounded-full border border-red-500 bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                        disabled={isDeleting}
                                        onClick={() => handleDeleteItem(list.id, item)}
                                      >
                                        {isDeleting ? 'Deleting…' : 'Confirm'}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-full border border-th-border px-2 py-1.5 text-xs text-muted"
                                        onClick={() => setConfirmDeleteItemKey(null)}
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
                                      disabled={isDeleting}
                                      onClick={() => setConfirmDeleteItemKey(`${list.id}:${item.id}`)}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Desktop table layout */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="text-faint">
                                <th className="py-2">Item</th>
                                <th className="py-2">Category</th>
                                <th className="py-2">Qty</th>
                                <th className="py-2">State</th>
                                <th className="py-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item) => {
                                const isUpdating = pendingKey === `${list.id}:${item.id}`;
                                const isDeleting = deletingItemKey === `${list.id}:${item.id}`;
                                const isMoving = movingItemKey === `${list.id}:${item.id}`;
                                return (
                                  <tr key={item.id} className="border-t border-th-border-light">
                                    <td className="py-3 font-semibold text-heading">{item.name}</td>
                                    <td className="py-3 text-muted">{item.category ?? '—'}</td>
                                    <td className="py-3 text-muted">{formatQuantity(item)}</td>
                                    <td className="py-3">
                                      <StatusBadge status={item.state} />
                                    </td>
                                    <td className="py-3">
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          className="rounded-full border border-th-border px-3 py-2 text-xs text-secondary disabled:opacity-40"
                                          disabled={isUpdating || isDeleting || isMoving}
                                          onClick={() => handleEditItem(list.id, item)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded-full border border-th-border px-3 py-2 text-xs text-primary disabled:opacity-40"
                                          disabled={item.state === 'IN_CART' || item.state === 'PURCHASED' || isUpdating || isDeleting || isMoving}
                                          onClick={() => handleStateChange(list.id, item.id, 'IN_CART')}
                                        >
                                          {isUpdating && updateItem.variables?.data?.state === 'IN_CART' ? 'Updating…' : 'Move to cart'}
                                        </button>
                                        <button
                                          type="button"
                                          className="rounded-full bg-btn-primary px-3 py-2 text-xs text-btn-primary-text disabled:opacity-40"
                                          disabled={item.state === 'PURCHASED' || isUpdating || isDeleting || isMoving}
                                          onClick={() => handleStateChange(list.id, item.id, 'PURCHASED')}
                                        >
                                          {isUpdating && updateItem.variables?.data?.state === 'PURCHASED' ? 'Saving…' : 'Purchased'}
                                        </button>
                                        {item.state === 'PURCHASED' && item.movedToInventoryAt && (
                                          <span
                                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-600"
                                            title={`Moved on ${new Date(item.movedToInventoryAt).toLocaleDateString()}`}
                                          >
                                            ✓ In Inventory
                                          </span>
                                        )}
                                        {item.state === 'PURCHASED' && !item.movedToInventoryAt && (
                                          <button
                                            type="button"
                                            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                                            disabled={isMoving || isDeleting}
                                            onClick={() => moveToInventory.mutate({ groceryItemId: item.id, groceryListId: list.id })}
                                          >
                                            {isMoving ? 'Moving…' : '→ Inventory'}
                                          </button>
                                        )}
                                        {confirmDeleteItemKey === `${list.id}:${item.id}` ? (
                                          <span className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              className="rounded-full border border-red-500 bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                              disabled={isDeleting}
                                              onClick={() => handleDeleteItem(list.id, item)}
                                            >
                                              {isDeleting ? 'Deleting…' : 'Confirm'}
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded-full border border-th-border px-2 py-2 text-xs text-muted"
                                              onClick={() => setConfirmDeleteItemKey(null)}
                                            >
                                              ✕
                                            </button>
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                                            disabled={isDeleting}
                                            onClick={() => setConfirmDeleteItemKey(`${list.id}:${item.id}`)}
                                          >
                                            Delete
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
                      </>
                    )}
                    {composerOpen ? (
                      <div className="mt-4 rounded-card border border-dashed border-th-border bg-hover-bg p-4">
                        <header className="mb-3">
                          <h4 className="text-sm font-semibold text-heading">Add item to {list.name}</h4>
                          {createErrorForList ? <p className="text-xs text-red-600">{createErrorForList}</p> : null}
                        </header>
                        <GroceryItemForm
                          submitLabel="Add item"
                          isSubmitting={isCreatePendingForList}
                          onSubmit={(values) => handleCreateItem(list.id, values)}
                          onCancel={() => setItemComposerListId(null)}
                        />
                      </div>
                    ) : null}
                    {editingTarget ? (
                      <div className="mt-4 rounded-card border border-th-border bg-card p-4">
                        <header className="mb-3">
                          <h4 className="text-sm font-semibold text-heading">Edit {editingTarget.name}</h4>
                          {updateErrorMessage && pendingKey === `${list.id}:${editingTarget.id}` ? (
                            <p className="text-xs text-red-600">{updateErrorMessage}</p>
                          ) : null}
                        </header>
                        <GroceryItemForm
                          initialValues={{
                            name: editingTarget.name,
                            category: editingTarget.category ?? undefined,
                            quantity: editingTarget.quantity,
                            unit: editingTarget.unit ?? undefined,
                            notes: editingTarget.notes ?? undefined,
                          }}
                          submitLabel="Save item"
                          isSubmitting={isEditingPending}
                          onSubmit={(values) => handleUpdateItemDetails(list.id, editingTarget, values)}
                          onCancel={() => setEditingItem(null)}
                        />
                      </div>
                    ) : null}
                    {bulkAddListId === list.id ? (
                      <div className="mt-4 rounded-card border border-dashed border-th-border bg-hover-bg p-4">
                        <header className="mb-3">
                          <h4 className="text-sm font-semibold text-heading">Add multiple items to {list.name}</h4>
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
                          placeholder={"3x bananas\n2 lbs chicken breast\nmilk\neggs 12\n1 bag spinach"}
                          value={bulkAddText}
                          onChange={(e) => setBulkAddText(e.target.value)}
                        />
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            className="rounded-full bg-btn-primary px-4 py-2 text-sm text-btn-primary-text disabled:opacity-40"
                            disabled={bulkAdd.isPending || !bulkAddText.trim()}
                            onClick={() => handleBulkAdd(list.id)}
                          >
                            {bulkAdd.isPending ? 'Adding…' : 'Add items'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-4 py-2 text-sm text-secondary"
                            onClick={() => { setBulkAddListId(null); setBulkAddText(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default GroceryPage;
