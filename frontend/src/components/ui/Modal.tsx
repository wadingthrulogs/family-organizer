import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tailwind max-width class, e.g. "max-w-lg". Defaults to max-w-lg. */
  maxWidth?: string;
}

/**
 * Accessible modal dialog built on the native <dialog> element.
 * - Focus is moved into the dialog on open and returned to the trigger on close.
 * - Focus is trapped natively by the browser when using showModal().
 * - Escape key closes the dialog (browser default + cancel event).
 * - Clicking the backdrop closes the dialog.
 */
export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      previousFocusRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Intercept native Escape so we control close via onClose
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`w-full ${maxWidth} rounded-card border border-th-border bg-card shadow-soft max-h-[90dvh] overflow-y-auto`}
      onClick={handleBackdropClick}
    >
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-heading" id="modal-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-muted hover:text-heading"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
