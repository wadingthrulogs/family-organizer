import { useState } from 'react';
import { useInventory } from '../../hooks/useInventory';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { useUpdateInventoryItemMutation } from '../../hooks/useInventoryMutations';
import { useAddLowStockToGroceryMutation } from '../../hooks/useGroceryMutations';
import { useGroceryLists } from '../../hooks/useGroceryLists';

export default function InventoryWidget() {
  const { data, isLoading } = useInventory();
  const { ref, compact, tiny, height, width, baseFontSize } = useWidgetSize();
  const items = data?.items ?? [];
  const lowStockItems = items.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  );

  const [pendingQtyId, setPendingQtyId] = useState<number | null>(null);
  const [groceryDropdownOpen, setGroceryDropdownOpen] = useState(false);
  const [addedMsg, setAddedMsg] = useState('');

  const updateQty = useUpdateInventoryItemMutation();
  const addLowStock = useAddLowStockToGroceryMutation();
  const { data: groceryData } = useGroceryLists();
  const groceryLists = groceryData?.items ?? [];

  const handleQtyChange = (itemId: number, current: number, delta: number) => {
    const next = Math.max(0, (current ?? 0) + delta);
    setPendingQtyId(itemId);
    updateQty.mutate(
      { itemId, data: { quantity: next } },
      { onSettled: () => setPendingQtyId(null) },
    );
  };

  const handleAddToGrocery = async (listId: number) => {
    setGroceryDropdownOpen(false);
    await addLowStock.mutateAsync(listId);
    const listName = groceryLists.find((l) => l.id === listId)?.name ?? 'list';
    setAddedMsg(`Added to ${listName}!`);
    setTimeout(() => setAddedMsg(''), 3000);
  };

  const showHeader = height > 80;
  const showLink = !compact;
  const showLowStock = height > 160 && lowStockItems.length > 0;
  const showList = height > 100;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            📦 {!tiny && 'Inventory'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.7em]">
              ({items.length})
            </span>
          </h2>
          {showLink && (
            <a href="/inventory" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">No items.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {/* Low stock alert */}
          {showLowStock && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5 shrink-0">
              <p className="text-[0.7em] font-semibold text-amber-700">
                ⚠️ {lowStockItems.length} low stock
              </p>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {lowStockItems.slice(0, width > 250 ? 5 : 3).map((i) => (
                  <span
                    key={i.id}
                    className="rounded-full border border-amber-300 px-1.5 py-0.5 text-[0.55em] text-amber-600"
                  >
                    {i.name} ({i.quantity})
                  </span>
                ))}
                {lowStockItems.length > (width > 250 ? 5 : 3) && (
                  <span className="text-[0.55em] text-amber-500">+{lowStockItems.length - (width > 250 ? 5 : 3)} more</span>
                )}
              </div>
              {!compact && (
                <div className="mt-1 relative">
                  {addedMsg ? (
                    <span className="text-[0.6em] text-emerald-600 font-medium">{addedMsg}</span>
                  ) : groceryLists.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onMouseDown={() => setGroceryDropdownOpen((v) => !v)}
                        disabled={addLowStock.isPending}
                        className="text-[0.6em] font-medium text-amber-700 underline disabled:opacity-50"
                      >
                        {addLowStock.isPending ? 'Adding…' : '🛒 Add all to grocery'}
                      </button>
                      {groceryDropdownOpen && (
                        <div className="absolute left-0 top-full mt-0.5 z-50 rounded-lg border border-th-border bg-card shadow-soft min-w-[140px]">
                          {groceryLists.map((list) => (
                            <button
                              key={list.id}
                              type="button"
                              onMouseDown={() => handleAddToGrocery(list.id)}
                              className="block w-full text-left px-3 py-1.5 text-xs text-heading hover:bg-hover-bg first:rounded-t-lg last:rounded-b-lg"
                            >
                              {list.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Items list */}
          {showList && (
            <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
              {items.slice(0, 10).map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}
                >
                  <span className="text-[var(--color-text)] truncate text-[0.9em]">{item.name}</span>
                  {!tiny && (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pendingQtyId === item.id}
                        onClick={() => handleQtyChange(item.id, item.quantity, -1)}
                        className="w-4 h-4 flex items-center justify-center rounded text-[0.7em] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] disabled:opacity-40 leading-none"
                      >−</button>
                      <span className="text-[0.65em] text-[var(--color-text-secondary)] min-w-[2ch] text-center tabular-nums">
                        {pendingQtyId === item.id ? '…' : item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={pendingQtyId === item.id}
                        onClick={() => handleQtyChange(item.id, item.quantity, 1)}
                        className="w-4 h-4 flex items-center justify-center rounded text-[0.7em] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] disabled:opacity-40 leading-none"
                      >+</button>
                      {item.unit && (
                        <span className="text-[0.6em] text-[var(--color-text-secondary)]">{item.unit}</span>
                      )}
                    </div>
                  )}
                </li>
              ))}
              {items.length > 10 && (
                <p className="text-[0.6em] text-[var(--color-text-secondary)] text-center">
                  +{items.length - 10} more
                </p>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
