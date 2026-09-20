import { useMemo } from 'react';
import { useInventory } from '../../hooks/useInventory';
import { useWidgetSize } from '../../hooks/useWidgetSize';

/**
 * Menu board of what's in the drink fridge — inventory items tagged
 * "Drink fridge". Anything at zero shows as out rather than disappearing, so
 * the board stays honest without someone having to untag it.
 */
export default function DrinkFridgeWidget() {
  const { ref, height, compact, tiny, baseFontSize } = useWidgetSize();
  const { data, isLoading } = useInventory({ drinkFridge: true });
  const items = data?.items ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.category?.trim() || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // Uncategorised last.
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [items]);

  const showHeader = height > 80;
  const available = items.filter((i) => i.quantity > 0).length;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <h2 className="font-semibold text-[var(--color-text)] text-[1.3em] mb-2 shrink-0">
          🥤 {!tiny && 'Drink fridge'}{' '}
          {!tiny && items.length > 0 && (
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">({available} on offer)</span>
          )}
        </h2>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">…</div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[var(--color-text-muted)] text-[0.95em] px-2">
          {compact ? 'Nothing tagged yet' : 'Tag items “Drink fridge” in Inventory and they show up here'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-area space-y-2 pr-1">
          {groups.map(([category, groupItems]) => (
            <div key={category || '__none'}>
              {category && groups.length > 1 && (
                <p className="text-[0.75em] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-0.5">{category}</p>
              )}
              <ul className="space-y-0.5">
                {groupItems.map((item) => {
                  const out = item.quantity <= 0;
                  return (
                    <li key={item.id} className={`flex items-baseline justify-between gap-2 text-[1em] ${out ? 'text-[var(--color-text-faint)] line-through' : 'text-[var(--color-text)]'}`}>
                      <span className="truncate">{item.name}</span>
                      {!tiny && (
                        <span className="shrink-0 text-[0.8em] text-[var(--color-text-secondary)] no-underline">
                          {out ? 'out' : `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
