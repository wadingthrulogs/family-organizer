import { useMemo, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
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

const stateStyles: Record<GroceryItemState, string> = {
  NEEDED: 'bg-rose-50 text-rose-700 border-rose-200',
  CLAIMED: 'bg-hover-bg text-secondary border-th-border',
  IN_CART: 'bg-amber-50 text-amber-700 border-amber-200',
  PURCHASED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const stateLabels: Record<GroceryItemState, string> = {
  NEEDED: 'Needed',
  CLAIMED: 'Claimed',
  IN_CART: 'In Cart',
  PURCHASED: 'Purchased',
};

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
  const [listComposerOpen, setListComposerOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [itemComposerListId, setItemComposerListId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<{ listId: number; item: GroceryItem } | null>(null);
  const [bulkAddListId, setBulkAddListId] = useState<number | null>(null);
  const [bulkAddText, setBulkAddText] = useState('');

  const lists = data?.items ?? [];
  const allItems = useMemo(() => lists.flatMap((list) => list.items ?? []), [lists]);
  const shoppingItems = useMemo<ShoppingItem[]>(() => {
    return lists
      .flatMap((list) =>
        (list.items ?? [])
          .filter((item) => item.state === 'NEEDED' || item.state === 'IN_CART')
          .map((item) => ({ ...item, listName: list.name, listId: list.id }))
      )
      .sort((a, b) => {
        if (shoppingStateOrder[a.state] !== shoppingStateOrder[b.state]) {
          return shoppingStateOrder[a.state] - shoppingStateOrder[b.state];
        }
        return a.name.localeCompare(b.name);
      });
  }, [lists]);
  const totalItems = allItems.length;
  const neededCount = useMemo(() => allItems.filter((item) => item.state === 'NEEDED').length, [allItems]);
  const inCartCount = useMemo(() => allItems.filter((item) => item.state === 'IN_CART').length, [allItems]);
  const purchasedCount = useMemo(() => allItems.filter((item) => item.state === 'PURCHASED').length, [allItems]);
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

  const handleDeleteList = async (listId: number, listName: string) => {
    await deleteList.mutateAsync(listId);
    if (itemComposerListId === listId) {
      setItemComposerListId(null);
    }
    if (editingItem?.listId === listId) {
      setEditingItem(null);
    }
  };

  const handleDeleteItem = async (listId: number, item: GroceryItem) => {
    await deleteItem.mutateAsync({ listId, itemId: item.id });
    if (editingItem && editingItem.item.id === item.id) {
      setEditingItem(null);
    }
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
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-full border border-th-border px-4 py-2 text-sm text-primary disabled:opacity-40"
            onClick={handleExportList}
            disabled={lists.length === 0}
          >
            📄 Export list
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
          <p className="text-xs uppercase tracking-wide text-muted">Active Lists</p>
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
                        {stateLabels[item.state]}
                      </span>
                      <button
                        type="button"
                        className="rounded-full border border-white/40 px-3 py-1 text-xs text-shopping-text disabled:opacity-40"
                        disabled={item.state === 'IN_CART' || item.state === 'PURCHASED' || isUpdating}
                        onClick={() => handleStateChange(item.listId, item.id, 'IN_CART')}
                      >
                        {isUpdating && updateItem.variables?.data?.state === 'IN_CART' ? 'Updating…' : 'Move to cart'}
                      </button>
                      <button
                        type="button"
                        className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-heading disabled:opacity-40"
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
                const items = list.items ?? [];
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
                      <div className="flex flex-col items-start gap-2 text-xs text-faint md:flex-row md:items-center md:gap-3">
                        <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-1 text-xs text-primary"
                            onClick={() => handleOpenItemComposer(list.id)}
                          >
                            {composerOpen ? 'Close composer' : 'Add item'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 disabled:opacity-40"
                            disabled={addLowStock.isPending && addLowStock.variables === list.id}
                            onClick={() => addLowStock.mutate(list.id)}
                          >
                            {addLowStock.isPending && addLowStock.variables === list.id ? 'Adding…' : 'Add low stock'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-1 text-xs text-primary"
                            onClick={() => handleOpenBulkAdd(list.id)}
                          >
                            {bulkAddListId === list.id ? 'Close bulk' : 'Bulk add'}
                          </button>
                          {purchasedNotMoved.length > 0 && (
                            <button
                              type="button"
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                              disabled={isMovingList}
                              onClick={() => moveListToInventory.mutate({ groceryListId: list.id })}
                            >
                              {isMovingList ? 'Moving…' : `Move all to Inventory (${purchasedNotMoved.length})`}
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-full border border-th-border px-3 py-1 text-xs text-primary"
                            onClick={() => handleOpenListEditor(list.id)}
                          >
                            {editingListId === list.id ? 'Cancel edit' : 'Edit list'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                            disabled={deletingListId === list.id}
                            onClick={() => handleDeleteList(list.id, list.name)}
                          >
                            {deletingListId === list.id ? 'Deleting…' : 'Delete list'}
                          </button>
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
                      <div className="overflow-x-auto">
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
                                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${stateStyles[item.state]}`}>
                                      {stateLabels[item.state]}
                                    </span>
                                  </td>
                                  <td className="py-3">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        className="rounded-full border border-th-border px-3 py-1 text-xs text-secondary disabled:opacity-40"
                                        disabled={isUpdating || isDeleting || isMoving}
                                        onClick={() => handleEditItem(list.id, item)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-full border border-th-border px-3 py-1 text-xs text-primary disabled:opacity-40"
                                        disabled={item.state === 'IN_CART' || item.state === 'PURCHASED' || isUpdating || isDeleting || isMoving}
                                        onClick={() => handleStateChange(list.id, item.id, 'IN_CART')}
                                      >
                                        {isUpdating && updateItem.variables?.data?.state === 'IN_CART' ? 'Updating…' : 'Move to cart'}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-full bg-btn-primary px-3 py-1 text-xs text-btn-primary-text disabled:opacity-40"
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
                                          className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
                                          disabled={isMoving || isDeleting}
                                          onClick={() => moveToInventory.mutate({ groceryItemId: item.id, groceryListId: list.id })}
                                        >
                                          {isMoving ? 'Moving…' : '→ Inventory'}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-40"
                                        disabled={isDeleting}
                                        onClick={() => handleDeleteItem(list.id, item)}
                                      >
                                        {isDeleting ? 'Deleting…' : 'Delete'}
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
                          <h4 className="text-sm font-semibold text-heading">Bulk add items to {list.name}</h4>
                          <p className="text-xs text-muted">One item per line. Supports formats like: <code>3x bananas</code>, <code>2 lbs chicken</code>, <code>milk</code>, <code>eggs 12</code></p>
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
