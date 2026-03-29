import { useState } from 'react';
import { useGroceryLists } from '../../hooks/useGroceryLists';
import { useCreateGroceryItemMutation } from '../../hooks/useGroceryMutations';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function GroceryWidget() {
  const { data, isLoading } = useGroceryLists();
  const { ref, compact, tiny, height, width, baseFontSize } = useWidgetSize();
  const lists = data?.items ?? [];
  const allItems = lists.flatMap((l) => l.items ?? []);
  const neededCount = allItems.filter((i) => i.state === 'NEEDED').length;
  const inCartCount = allItems.filter((i) => i.state === 'IN_CART').length;
  const purchasedCount = allItems.filter((i) => i.state === 'PURCHASED').length;

  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddListId, setQuickAddListId] = useState<number | null>(null);
  const [addedMsg, setAddedMsg] = useState('');
  const addItem = useCreateGroceryItemMutation();

  const selectedListId = quickAddListId ?? lists[0]?.id ?? null;

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickAddText.trim();
    if (!name || !selectedListId) return;
    await addItem.mutateAsync({ listId: selectedListId, data: { name } });
    setQuickAddText('');
    setAddedMsg('Added!');
    setTimeout(() => setAddedMsg(''), 2500);
  };

  const showHeader = height > 80;
  const showLink = !compact;
  const showQuickAdd = !compact && lists.length > 0;
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

      {/* Quick-add form */}
      {showQuickAdd && (
        <form onSubmit={handleQuickAdd} className="flex items-center gap-1 mb-2 shrink-0">
          {lists.length > 1 && (
            <select
              value={selectedListId ?? ''}
              onChange={(e) => setQuickAddListId(Number(e.target.value))}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] text-[0.7em] px-1 py-0.5 shrink-0 max-w-[5rem]"
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
            placeholder="Add item…"
            disabled={addItem.isPending}
            className="flex-1 min-w-0 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] text-[0.75em] px-2 py-0.5 outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!quickAddText.trim() || !selectedListId || addItem.isPending}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-[var(--color-accent)] text-white text-[0.8em] font-bold disabled:opacity-40"
          >
            {addItem.isPending ? '…' : addedMsg ? '✓' : '+'}
          </button>
        </form>
      )}

      <p aria-live="polite" role="status" className="text-[0.65em] text-emerald-600 font-medium mb-1 shrink-0 min-h-[1em]">
        {addedMsg}
      </p>

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
