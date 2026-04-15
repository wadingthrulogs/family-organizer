import { useInventory } from '../../hooks/useInventory';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function InventoryWidget() {
  const { data, isLoading } = useInventory();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const items = data?.items ?? [];

  const lowStockItems = items.filter(
    (i) => i.quantity === 0 || (i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold),
  );

  const showHeader = height > 80;
  const showLink = !compact;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            📦 {!tiny && 'Low Stock'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">
              ({lowStockItems.length})
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

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-[1em] text-[var(--color-text-secondary)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">📦</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">No items tracked yet.</p>
          </div>
        ) : lowStockItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">✨</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">Fully stocked!</p>
          </div>
        ) : (
          <ul className="space-y-2 pr-0.5">
            {lowStockItems.slice(0, 10).map((item) => {
              const isOut = item.quantity === 0;
              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 min-h-[56px] rounded-xl border px-4 py-3 ${
                    isOut
                      ? 'border-2 border-red-500 bg-red-500/10'
                      : 'border-amber-400 bg-amber-50/40 dark:bg-amber-900/20'
                  }`}
                >
                  <span className="flex-1 text-[var(--color-text)] truncate text-[1em]">
                    {item.name}
                  </span>
                  <span
                    className={`shrink-0 text-[0.85em] font-semibold tabular-nums ${
                      isOut ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isOut ? 'OUT' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`}
                  </span>
                </li>
              );
            })}
            {lowStockItems.length > 10 && (
              <p className="text-[0.9em] text-[var(--color-text-secondary)] text-center pt-1">
                +{lowStockItems.length - 10} more
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
