import { useEffect, useRef, useState } from 'react';
import { useInventory } from '../../hooks/useInventory';
import { useUpdateInventoryItemMutation } from '../../hooks/useInventoryMutations';
import { useWidgetSize } from '../../hooks/useWidgetSize';

type ViewMode = 'all' | 'low' | 'search';

export default function InventoryWidget() {
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const [view, setView] = useState<ViewMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateInventoryItemMutation();

  const { data, isLoading } = useInventory();
  const allItems = data?.items ?? [];

  const lowStockItems = allItems.filter(
    (i) => i.quantity === 0 || (i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold),
  );

  const searchResults = searchQuery.trim()
    ? allItems.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const displayItems = view === 'low' ? lowStockItems : view === 'search' ? searchResults : allItems;

  useEffect(() => {
    if (view === 'search') {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [view]);

  useEffect(() => {
    if (editingId !== null) {
      setTimeout(() => qtyInputRef.current?.focus(), 0);
    }
  }, [editingId]);

  const handleSetLowStock = (itemId: number) => {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    updateItem.mutate({
      itemId,
      data: { lowStockThreshold: Math.max(item.quantity, 1) },
    });
  };

  const handleMarkOut = (itemId: number) => {
    updateItem.mutate({ itemId, data: { quantity: 0 } });
  };

  const handleStartEdit = (itemId: number, currentQty: number) => {
    setEditingId(itemId);
    setEditQty(String(currentQty));
  };

  const handleSaveQty = (itemId: number) => {
    const qty = parseInt(editQty, 10);
    if (!isNaN(qty) && qty >= 0) {
      updateItem.mutate({ itemId, data: { quantity: qty } });
    }
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const showHeader = height > 80;
  const showLink = !compact;
  const showTabs = height > 160;

  const tabs: { id: ViewMode; label: string; icon: string; count?: number }[] = [
    { id: 'all', label: 'All', icon: '📦', count: allItems.length },
    { id: 'low', label: 'Low', icon: '⚠️', count: lowStockItems.length },
    { id: 'search', label: 'Search', icon: '🔍' },
  ];

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            📦 {!tiny && 'Inventory'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">
              ({allItems.length})
            </span>
          </h2>
          {showLink && (
            <a
              href="/inventory"
              className="inline-flex items-center min-h-[44px] px-3 text-[0.9em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation shrink-0"
            >
              View →
            </a>
          )}
        </div>
      )}

      {showTabs && (
        <div className="flex gap-1 mb-2 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setView(tab.id); if (tab.id !== 'search') setSearchQuery(''); }}
              className={`flex-1 min-h-[36px] rounded-md text-[0.85em] font-medium transition-colors touch-manipulation ${
                view === tab.id
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {tiny ? tab.icon : tab.label}
              {tab.count !== undefined && !tiny ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
      )}

      {view === 'search' && (
        <div className="mb-2 shrink-0">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inventory…"
            className="w-full min-h-[40px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[0.95em] text-[var(--color-text)] placeholder-[var(--color-text-faint)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-[1em] text-[var(--color-text-secondary)]">Loading…</p>
        ) : displayItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">
              {view === 'search' ? '🔍' : view === 'low' ? '✨' : '📦'}
            </span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">
              {view === 'search'
                ? searchQuery.trim() ? 'No matches found.' : 'Type to search items.'
                : view === 'low'
                ? 'Fully stocked!'
                : 'No items tracked yet.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 pr-0.5">
            {displayItems.slice(0, 15).map((item) => {
              const isLow = item.quantity === 0 || (item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold);
              const isOut = item.quantity === 0;
              const hasThreshold = item.lowStockThreshold != null;
              const isEditing = editingId === item.id;

              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-2 min-h-[44px] rounded-xl border px-3 py-2 ${
                    isOut
                      ? 'border-2 border-red-500 bg-red-500/10'
                      : isLow
                      ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-900/20'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                  }`}
                >
                  <span className="flex-1 text-[var(--color-text)] truncate text-[0.95em]">
                    {item.name}
                  </span>

                  {isEditing ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        ref={qtyInputRef}
                        type="number"
                        min="0"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveQty(item.id);
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="w-[4em] min-h-[32px] rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 text-[0.85em] text-center text-[var(--color-text)] outline-none tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveQty(item.id)}
                        className="min-h-[32px] px-2 rounded-lg text-[0.75em] font-medium bg-[var(--color-accent)] text-white touch-manipulation active:scale-95"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="min-h-[32px] px-2 rounded-lg text-[0.75em] font-medium border border-[var(--color-border)] text-[var(--color-text-secondary)] touch-manipulation active:scale-95"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Quantity — tap to edit */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item.id, item.quantity)}
                        title="Tap to edit quantity"
                        className={`min-h-[32px] px-2 rounded-lg text-[0.8em] font-semibold tabular-nums transition-colors touch-manipulation active:scale-95 ${
                          isOut
                            ? 'text-red-500 hover:bg-red-500/10'
                            : isLow
                            ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                      >
                        {isOut ? 'OUT' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`}
                      </button>

                      {/* Quick actions */}
                      {!isOut && (
                        <button
                          type="button"
                          onClick={() => handleMarkOut(item.id)}
                          disabled={updateItem.isPending}
                          title="Mark as out of stock"
                          className="min-h-[32px] px-2 rounded-lg text-[0.7em] font-medium text-red-500 border border-red-300 hover:bg-red-500/10 transition-colors touch-manipulation active:scale-95 disabled:opacity-50"
                        >
                          Out
                        </button>
                      )}
                      {!hasThreshold && view !== 'search' && (
                        <button
                          type="button"
                          onClick={() => handleSetLowStock(item.id)}
                          disabled={updateItem.isPending}
                          title="Track low stock"
                          className="min-h-[32px] px-2 rounded-lg text-[0.7em] font-medium bg-[var(--color-accent)] text-white hover:opacity-80 transition-opacity touch-manipulation active:scale-95 disabled:opacity-50"
                        >
                          Track
                        </button>
                      )}
                      {view === 'search' && !hasThreshold && (
                        <button
                          type="button"
                          onClick={() => handleSetLowStock(item.id)}
                          disabled={updateItem.isPending}
                          title="Track low stock"
                          className="min-h-[32px] px-2 rounded-lg text-[0.7em] font-medium bg-[var(--color-accent)] text-white hover:opacity-80 transition-opacity touch-manipulation active:scale-95 disabled:opacity-50"
                        >
                          + Track
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {displayItems.length > 15 && (
              <li className="text-[0.9em] text-[var(--color-text-secondary)] text-center pt-1">
                +{displayItems.length - 15} more — <a href="/inventory" className="text-[var(--color-accent)]">view all</a>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
