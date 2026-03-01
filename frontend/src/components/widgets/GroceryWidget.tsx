import { useGroceryLists } from '../../hooks/useGroceryLists';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function GroceryWidget() {
  const { data, isLoading } = useGroceryLists();
  const { ref, compact, tiny, height, width, baseFontSize } = useWidgetSize();
  const lists = data?.items ?? [];
  const allItems = lists.flatMap((l) => l.items ?? []);
  const neededCount = allItems.filter((i) => i.state === 'NEEDED').length;
  const inCartCount = allItems.filter((i) => i.state === 'IN_CART').length;
  const purchasedCount = allItems.filter((i) => i.state === 'PURCHASED').length;

  const showHeader = height > 80;
  const showLink = !compact;
  const showStats = height > 140 && width > 160;
  const showList = height > 200 || (!showStats && height > 100);

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.2em]">
            🛒 {!tiny && 'Grocery'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.7em]">
              ({lists.length})
            </span>
          </h2>
          {showLink && (
            <a href="/grocery" className="text-[0.7em] text-[var(--color-accent)] hover:underline shrink-0">
              View →
            </a>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-[0.85em] text-[var(--color-text-secondary)]">No grocery lists.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {/* Summary stats */}
          {showStats && (
            <div className={`grid gap-1.5 shrink-0 ${width > 250 ? 'grid-cols-3' : 'grid-cols-1'}`}>
              <div className="rounded-lg bg-rose-50/80 border border-rose-200 px-2 py-1 text-center">
                <p className="font-bold text-rose-600 text-[1.2em]">{neededCount}</p>
                <p className="text-[0.55em] text-rose-500 uppercase tracking-wide">Needed</p>
              </div>
              {width > 250 && (
                <>
                  <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-2 py-1 text-center">
                    <p className="font-bold text-amber-600 text-[1.2em]">{inCartCount}</p>
                    <p className="text-[0.55em] text-amber-500 uppercase tracking-wide">In Cart</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50/80 border border-emerald-200 px-2 py-1 text-center">
                    <p className="font-bold text-emerald-600 text-[1.2em]">{purchasedCount}</p>
                    <p className="text-[0.55em] text-emerald-500 uppercase tracking-wide">Bought</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Needed items */}
          {showList && neededCount > 0 && (
            <ul className="space-y-0.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
              {allItems
                .filter((i) => i.state === 'NEEDED')
                .slice(0, 10)
                .map((item) => (
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
              {neededCount > 10 && (
                <p className="text-[0.6em] text-[var(--color-text-secondary)] text-center">
                  +{neededCount - 10} more
                </p>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
