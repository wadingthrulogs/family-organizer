import { useState } from 'react';
import { useGroceryLists } from '../../hooks/useGroceryLists';
import { useCreateGroceryItemMutation } from '../../hooks/useGroceryMutations';
import { useWidgetSize } from '../../hooks/useWidgetSize';

export default function GroceryWidget() {
  const { data, isLoading } = useGroceryLists();
  const { ref, compact, tiny, height, baseFontSize } = useWidgetSize();
  const lists = data?.items ?? [];
  const allItems = lists.flatMap((l) => l.items ?? []);
  const neededItems = allItems.filter((i) => i.state === 'NEEDED');
  const neededCount = neededItems.length;

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

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
          <h2 className="font-semibold text-[var(--color-text)] text-[1.3em]">
            🛒 {!tiny && 'Grocery'}{' '}
            <span className="font-normal text-[var(--color-text-secondary)] text-[0.9em]">
              ({neededCount})
            </span>
          </h2>
          {showLink && (
            <a
              href="/grocery"
              className="inline-flex items-center min-h-[44px] px-3 text-[0.9em] font-medium text-[var(--color-accent)] rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors touch-manipulation shrink-0"
            >
              View →
            </a>
          )}
        </div>
      )}

      {showQuickAdd && (
        <form onSubmit={handleQuickAdd} className="flex items-center gap-2 mb-3 shrink-0">
          {lists.length > 1 && (
            <select
              value={selectedListId ?? ''}
              onChange={(e) => setQuickAddListId(Number(e.target.value))}
              className="min-h-[48px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] text-[0.9em] px-3 shrink-0 max-w-[8rem]"
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
            className="flex-1 min-w-0 min-h-[48px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)] text-[1em] px-3 outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!quickAddText.trim() || !selectedListId || addItem.isPending}
            className="shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-[var(--color-accent)] text-white text-2xl font-bold disabled:opacity-40 touch-manipulation active:scale-95"
            aria-label="Add item"
          >
            {addItem.isPending ? '…' : addedMsg ? '✓' : '+'}
          </button>
        </form>
      )}

      {addedMsg && (
        <p aria-live="polite" role="status" className="text-[0.9em] text-emerald-600 font-medium mb-2 shrink-0">
          {addedMsg}
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <p className="text-[1em] text-[var(--color-text-secondary)]">Loading…</p>
        ) : lists.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">🛒</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">No grocery lists yet.</p>
          </div>
        ) : neededCount === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 h-full">
            <span className="text-[2em]">✅</span>
            <p className="text-[1em] text-[var(--color-text-secondary)]">Nothing needed!</p>
          </div>
        ) : (
          <ul className="space-y-2 pr-0.5">
            {neededItems.slice(0, 10).map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 min-h-[56px] rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3"
              >
                <span className="flex-1 text-[var(--color-text)] truncate text-[1em]">{item.name}</span>
                {!tiny && (item.quantity > 1 || item.unit) && (
                  <span className="shrink-0 text-[0.9em] text-[var(--color-text-secondary)] tabular-nums">
                    {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                  </span>
                )}
              </li>
            ))}
            {neededCount > 10 && (
              <p className="text-[0.9em] text-[var(--color-text-secondary)] text-center pt-1">
                +{neededCount - 10} more
              </p>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
