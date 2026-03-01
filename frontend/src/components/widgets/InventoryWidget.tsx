import { useInventory } from '../../hooks/useInventory';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function InventoryWidget() {
  const { data, isLoading } = useInventory();
  const { ref, compact, tiny, height, width, baseFontSize } = useWidgetSize();
  const items = data?.items ?? [];
  const lowStockItems = items.filter(
    (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
  );

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
                    <span className="shrink-0 text-[0.6em] text-[var(--color-text-secondary)]">
                      {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                    </span>
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
