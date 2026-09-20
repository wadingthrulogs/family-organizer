import { useGuestContent } from '../../hooks/useGuestContent';
import { useWidgetSize } from '../../hooks/useWidgetSize';

/** What the household is currently reading — a conversation starter, not data. */
export default function ReadingWidget() {
  const { ref, height, compact, tiny, baseFontSize } = useWidgetSize();
  const { data, isLoading } = useGuestContent();
  const books = data?.books ?? [];

  const showHeader = height > 80;
  const showCovers = !compact;
  // Synopses need room; on a short card the list is the point.
  const showSynopsis = !compact && height > 260;

  return (
    <div ref={ref} style={{ fontSize: baseFontSize * 0.6 }} className="rounded-2xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 h-full overflow-hidden flex flex-col">
      {showHeader && (
        <h2 className="font-semibold text-[var(--color-text)] text-[1.3em] mb-2 shrink-0">
          📚 {!tiny && 'Currently reading'}
        </h2>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">…</div>
      ) : books.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[var(--color-text-muted)] text-[0.95em] px-2">
          {compact ? 'No books yet' : 'Add what you’re reading in Settings → Guest display'}
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scroll-area space-y-2 pr-1">
          {books.map((book) => (
            <li key={book.id} className="flex gap-2.5 items-start">
              {showCovers && (
                book.coverAttachmentId ? (
                  <img
                    src={`/api/v1/attachments/${book.coverAttachmentId}/download`}
                    alt=""
                    className="h-[4.2em] w-[2.9em] shrink-0 rounded object-cover shadow-sm"
                  />
                ) : (
                  <div className="h-[4.2em] w-[2.9em] shrink-0 rounded bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-[1.4em]" aria-hidden>📖</div>
                )
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--color-text)] text-[1em] leading-tight line-clamp-2">{book.title}</p>
                {(book.author || book.reader) && !tiny && (
                  <p className="text-[0.85em] text-[var(--color-text-secondary)] truncate">
                    {book.author}{book.author && book.reader ? ' · ' : ''}{book.reader && <span className="text-[var(--color-text-muted)]">{book.reader}</span>}
                  </p>
                )}
                {showSynopsis && book.synopsis && (
                  <p className="mt-0.5 text-[0.82em] leading-snug text-[var(--color-text-secondary)] line-clamp-3">{book.synopsis}</p>
                )}
                {book.enrichStatus === 'pending' && !tiny && (
                  <p className="mt-0.5 text-[0.75em] italic text-[var(--color-text-faint)]">Looking up details…</p>
                )}
                {book.progress != null && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full bg-[var(--color-bg)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${Math.max(0, Math.min(100, book.progress))}%` }} />
                    </div>
                    {!tiny && <span className="text-[0.75em] text-[var(--color-text-muted)] tabular-nums">{Math.round(book.progress)}%</span>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
