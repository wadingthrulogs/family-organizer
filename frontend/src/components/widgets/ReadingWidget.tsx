import { useState } from 'react';
import type { GuestBook } from '../../api/guest';
import { useGuestContent } from '../../hooks/useGuestContent';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import { Modal } from '../ui/Modal';

const coverUrl = (id: number) => `/api/v1/attachments/${id}/download`;

/** "September 22, 2026" — or just "Finished" if the stored value is unusable. */
function finishedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Finished';
  return `Finished ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

/** "Sep 22" for the shelf captions, where there's no room for the long form. */
function shortFinishedLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Newest first; books with an unreadable date sort last. */
function byFinishedDesc(a: GuestBook, b: GuestBook): number {
  return (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '');
}

/** Centered detail view: big cover, full synopsis at a comfortable reading size. */
function BookDetailModal({ book, onClose }: { book: GuestBook | null; onClose: () => void }) {
  return (
    <Modal open={book !== null} onClose={onClose} title={book?.title ?? ''} maxWidth="max-w-3xl">
      {book && (
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="shrink-0 self-center sm:self-start">
            {book.coverAttachmentId ? (
              <img
                src={coverUrl(book.coverAttachmentId)}
                alt={`Cover of ${book.title}`}
                className="w-48 max-h-[60dvh] rounded-lg object-contain shadow-soft sm:w-56"
              />
            ) : (
              <div className="flex h-72 w-48 items-center justify-center rounded-lg border border-th-border bg-page text-6xl sm:w-56" aria-hidden>📖</div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {(book.author || book.year) && (
              <p className="text-lg text-secondary">
                {book.author}{book.author && book.year ? ' · ' : ''}{book.year ?? ''}
              </p>
            )}
            {book.reader && (
              <p className="text-base text-muted">
                {book.finishedAt ? 'Read by ' : 'Being read by '}
                <span className="font-medium text-primary">{book.reader}</span>
              </p>
            )}
            {book.finishedAt ? (
              <p className="inline-flex items-center gap-1.5 rounded-pill bg-page px-3 py-1 text-sm text-muted">
                <span aria-hidden>✓</span>{finishedLabel(book.finishedAt)}
              </p>
            ) : (
              book.progress != null && (
                <div className="flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-page">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, book.progress))}%` }} />
                  </div>
                  <span className="text-sm tabular-nums text-muted">{Math.round(book.progress)}% read</span>
                </div>
              )
            )}
            {book.synopsis ? (
              <p className="text-lg leading-relaxed text-primary whitespace-pre-line">{book.synopsis}</p>
            ) : (
              <p className="text-base italic text-muted">
                {book.enrichStatus === 'pending' ? 'Looking up a synopsis…' : 'No synopsis yet.'}
              </p>
            )}
            <div className="pt-2">
              <button type="button" onClick={onClose} className="btn-secondary btn-pill min-h-[48px] px-6 text-base touch-manipulation">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** What the household is currently reading — a conversation starter, not data. */
export default function ReadingWidget() {
  const { ref, height, compact, tiny, baseFontSize } = useWidgetSize();
  const { data, isLoading } = useGuestContent();
  const books = data?.books ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const openBook = books.find((b) => b.id === openId) ?? null;

  const current = books.filter((b) => !b.finishedAt);
  const finished = books.filter((b) => b.finishedAt).sort(byFinishedDesc);

  const showHeader = height > 80;
  const showCovers = !compact;
  // Synopses need room; on a short card the list is the point.
  const showSynopsis = !compact && height > 260;
  // The shelf is a nicety — it only earns its strip when the card is tall enough
  // that giving it up doesn't squeeze what's actually being read.
  const showShelf = finished.length > 0 && !tiny && (height > 240 || current.length === 0);

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
      ) : current.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[var(--color-text-muted)] text-[0.95em] px-2">
          Between books right now
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto scroll-area space-y-2 pr-1">
          {current.map((book) => (
            <li key={book.id}>
            <button
              type="button"
              onClick={() => setOpenId(book.id)}
              aria-label={`Details for ${book.title}`}
              className="flex w-full gap-2.5 items-start rounded-lg p-1 -m-1 text-left hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-hover)] touch-manipulation transition-colors"
            >
              {showCovers && (
                book.coverAttachmentId ? (
                  <img
                    src={coverUrl(book.coverAttachmentId)}
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
            </button>
            </li>
          ))}
        </ul>
      )}

      {showShelf && (
        <div className="shrink-0 mt-2 pt-2 border-t border-[var(--color-border)]">
          <p className="text-[0.7em] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
            Recently finished · {finished.length}
          </p>
          <ul className="flex gap-1.5 overflow-x-auto scroll-area pb-0.5">
            {finished.map((book) => (
              <li key={book.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenId(book.id)}
                  aria-label={`Details for ${book.title}, ${finishedLabel(book.finishedAt!).toLowerCase()}`}
                  title={`${book.title} — ${shortFinishedLabel(book.finishedAt!)}`}
                  className="block w-[2.4em] rounded hover:opacity-75 active:opacity-75 touch-manipulation transition-opacity"
                >
                  {book.coverAttachmentId ? (
                    <img
                      src={coverUrl(book.coverAttachmentId)}
                      alt=""
                      className="h-[3.4em] w-full rounded object-cover shadow-sm"
                    />
                  ) : (
                    <div className="h-[3.4em] w-full rounded bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-[1.1em]" aria-hidden>📖</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BookDetailModal book={openBook} onClose={() => setOpenId(null)} />
    </div>
  );
}
