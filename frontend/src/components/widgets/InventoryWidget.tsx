import { useState } from 'react';
import { useInventory } from '../../hooks/useInventory';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { useUpdateInventoryItemMutation } from '../../hooks/useInventoryMutations';

export default function InventoryWidget() {
  const { data, isLoading } = useInventory();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const items = data?.items ?? [];
  const lowStockCount = items.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  ).length;

  const [pendingQtyId, setPendingQtyId] = useState<number | null>(null);
  const [pendingMarkLowId, setPendingMarkLowId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);

  const updateQty = useUpdateInventoryItemMutation();

  const isSearching = searchText.trim().length > 0;
  const filteredItems = (() => {
    let result = items;
    if (showLowOnly) result = result.filter((i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold);
    if (isSearching) result = result.filter((i) => i.name.toLowerCase().includes(searchText.toLowerCase()));
    return result;
  })();

  const handleQtyChange = (itemId: number, current: number, delta: number) => {
    const next = Math.max(0, (current ?? 0) + delta);
    setPendingQtyId(itemId);
    updateQty.mutate(
      { itemId, data: { quantity: next } },
      { onSettled: () => setPendingQtyId(null) },
    );
  };

  const handleMarkLow = (itemId: number, threshold: number) => {
    setPendingMarkLowId(itemId);
    updateQty.mutate(
      { itemId, data: { quantity: threshold } },
      { onSettled: () => setPendingMarkLowId(null) },
    );
  };

  const showHeader = height > 80;
  const showLink = !compact;
  const showList = height > 100;
  const showSearch = !compact && items.length > 0;

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
          <div className="flex items-center gap-2 shrink-0">
            {lowStockCount > 0 && (
              <button
                type="button"
                onClick={() => setShowLowOnly((v) => !v)}
                className={`rounded-full border px-2 py-0.5 text-[0.65em] font-medium whitespace-nowrap transition ${
                  showLowOnly
                    ? 'border-amber-400 bg-amber-100 text-amber-800'
                    : 'border-amber-300 bg-amber-50/80 text-amber-700 hover:bg-amber-100'
                }`}
              >
                ⚠️ {lowStockCount} low stock
              </button>
            )}
            {showLink && (
              <a href="/inventory" className="text-[0.7em] text-[var(--color-accent)] hover:underline">
                View →
              </a>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">No items.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {/* Search input */}
          {showSearch && (
            <div className="relative shrink-0">
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[0.7em] text-[var(--color-text-secondary)] pointer-events-none">🔍</span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search inventory…"
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] text-[0.75em] pl-5 pr-5 py-0.5 outline-none focus:border-[var(--color-accent)]"
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[0.7em] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] leading-none"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {/* Items list */}
          {showList && (
            <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
              {filteredItems.length === 0 && isSearching ? (
                <li className="text-[0.75em] text-[var(--color-text-secondary)] px-2 py-1">No items match.</li>
              ) : (
                filteredItems.slice(0, 10).map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] gap-2 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'}`}
                  >
                    <span className="text-[var(--color-text)] truncate text-[0.9em] min-w-0">{item.name}</span>
                    {!tiny && (
                      <div className="shrink-0 flex items-center gap-1">
                        {/* qty −/+ always shown */}
                        <button
                          type="button"
                          disabled={pendingQtyId === item.id || pendingMarkLowId === item.id || item.quantity <= 0}
                          onClick={() => handleQtyChange(item.id, item.quantity, -1)}
                          className="w-4 h-4 flex items-center justify-center rounded text-[0.7em] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] disabled:opacity-40 leading-none"
                        >−</button>
                        <span className="text-[0.65em] text-[var(--color-text-secondary)] min-w-[2ch] text-center tabular-nums">
                          {(pendingQtyId === item.id || pendingMarkLowId === item.id) ? '…' : item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={pendingQtyId === item.id || pendingMarkLowId === item.id}
                          onClick={() => handleQtyChange(item.id, item.quantity, 1)}
                          className="w-4 h-4 flex items-center justify-center rounded text-[0.7em] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover-bg)] disabled:opacity-40 leading-none"
                        >+</button>
                        {item.unit && (
                          <span className="text-[0.6em] text-[var(--color-text-secondary)]">{item.unit}</span>
                        )}
                        {/* Set to min */}
                        <button
                          type="button"
                          disabled={item.lowStockThreshold == null || pendingMarkLowId === item.id || pendingQtyId === item.id}
                          title={item.lowStockThreshold == null ? 'No threshold set' : `Set qty to threshold (${item.lowStockThreshold})`}
                          onClick={() => item.lowStockThreshold != null && handleMarkLow(item.id, item.lowStockThreshold)}
                          className="ml-0.5 rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[0.55em] font-medium text-amber-700 disabled:opacity-40 hover:bg-amber-100"
                        >
                          Min
                        </button>
                      </div>
                    )}
                  </li>
                ))
              )}
              {filteredItems.length > 10 && (
                <p className="text-[0.6em] text-[var(--color-text-secondary)] text-center">
                  +{filteredItems.length - 10} more
                </p>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
