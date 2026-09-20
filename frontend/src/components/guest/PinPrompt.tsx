import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { verifyDisplayPin } from '../../api/auth';

interface PinPromptProps {
  open: boolean;
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Numeric PIN check used to leave guest mode. Kept deliberately plain: it
 * runs on the wall display's on-screen keyboard, so one field, big digits,
 * and inputMode="numeric" so squeekboard shows a number pad.
 */
export function PinPrompt({ open, title = 'Enter PIN', onSuccess, onCancel }: PinPromptProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    setError('');
    try {
      const ok = await verifyDisplayPin(pin);
      if (ok) {
        onSuccess();
      } else {
        setError('Incorrect PIN');
        setPin('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Couldn’t check the PIN. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-xs">
      <form onSubmit={submit} className="space-y-3">
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          aria-label="PIN"
          className="w-full rounded-lg border border-th-border bg-input px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-accent"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-pill px-4 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={!pin || busy} className="btn-primary btn-pill px-5 py-2 text-sm disabled:opacity-50">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
