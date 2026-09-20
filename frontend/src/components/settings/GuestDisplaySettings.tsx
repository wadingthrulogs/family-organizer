import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { setDisplayPin } from '../../api/auth';
import type { GuestBook, GuestWifi, WifiSecurity } from '../../api/guest';
import { useGuestContent, useUpdateGuestContentMutation } from '../../hooks/useGuestContent';
import { useAuth } from '../../hooks/useAuth';

/**
 * Settings → Guest display. Everything the guest mode shows that isn't
 * derived from elsewhere: the Wi-Fi network, the reading list, and the
 * optional PIN that gates leaving guest mode. (The drink fridge is driven
 * by inventory tags, so it's edited on the Inventory page.)
 */
export default function GuestDisplaySettings() {
  return (
    <section className="border-t border-th-border-light pt-6">
      <h2 className="font-semibold text-heading">Guest display</h2>
      <p className="text-sm text-muted mb-4">
        A second wall-display mode that shows no household data. Open it from the dashboard ⚙ menu → <strong>Guest mode</strong>.
        The drink fridge board comes from inventory items tagged <em>Drink fridge</em>.
      </p>
      <div className="space-y-8">
        <WifiEditor />
        <BooksEditor />
        <DisplayPinEditor />
      </div>
    </section>
  );
}

/* ─── Wi-Fi ─── */

const EMPTY_WIFI: GuestWifi = { ssid: '', security: 'WPA', password: '', hidden: false };

function WifiEditor() {
  const { data, isLoading } = useGuestContent();
  const update = useUpdateGuestContentMutation();
  const [form, setForm] = useState<GuestWifi>(EMPTY_WIFI);
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data.wifi ?? EMPTY_WIFI);
  }, [data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await update.mutateAsync({ wifi: form.ssid.trim() ? form : null });
    setSaved(true);
  };

  const set = <K extends keyof GuestWifi>(key: K, value: GuestWifi[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold text-heading">📶 Wi-Fi</h3>
      <p className="text-xs text-muted">Shown as a QR code guests can scan to join. Leave the network name blank to remove it.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-form-label">
          Network name (SSID)
          <input
            type="text"
            value={form.ssid}
            onChange={(e) => set('ssid', e.target.value)}
            disabled={isLoading}
            className="mt-1 w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm font-normal"
            autoComplete="off"
          />
        </label>
        <label className="text-sm font-semibold text-form-label">
          Security
          <select
            value={form.security}
            onChange={(e) => set('security', e.target.value as WifiSecurity)}
            className="mt-1 w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm font-normal"
          >
            <option value="WPA">WPA / WPA2 / WPA3</option>
            <option value="WEP">WEP</option>
            <option value="nopass">Open (no password)</option>
          </select>
        </label>
        {form.security !== 'nopass' && (
          <label className="text-sm font-semibold text-form-label md:col-span-2">
            Password
            <div className="mt-1 flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className="w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm font-normal font-mono"
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="btn-secondary btn-pill px-3 py-2 text-xs shrink-0">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-form-label md:col-span-2">
          <input type="checkbox" checked={form.hidden} onChange={(e) => set('hidden', e.target.checked)} className="h-4 w-4" />
          Hidden network (doesn’t broadcast its name)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={update.isPending || isLoading} className="btn-primary btn-pill px-5 py-2 text-sm disabled:opacity-50">
          {update.isPending ? 'Saving…' : 'Save Wi-Fi'}
        </button>
        {saved && !update.isPending && <span className="text-sm text-muted">Saved.</span>}
        {update.isError && <span className="text-sm text-red-600">Couldn’t save.</span>}
      </div>
    </form>
  );
}

/* ─── Books ─── */

type BookDraft = Omit<GuestBook, 'id'> & { id?: string };
const EMPTY_BOOK: BookDraft = { title: '', author: '', reader: '', progress: null, coverAttachmentId: null };

function BooksEditor() {
  const { data, isLoading } = useGuestContent();
  const update = useUpdateGuestContentMutation();
  const [books, setBooks] = useState<BookDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (data && !dirty) setBooks(data.books);
  }, [data, dirty]);

  const edit = (i: number, patch: Partial<BookDraft>) => {
    setDirty(true);
    setBooks((list) => list.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };
  const remove = (i: number) => {
    setDirty(true);
    setBooks((list) => list.filter((_, idx) => idx !== i));
  };
  const add = () => {
    setDirty(true);
    setBooks((list) => [...list, { ...EMPTY_BOOK }]);
  };

  const uploadCover = async (i: number, file: File | undefined) => {
    if (!file) return;
    setUploadingIndex(i);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: att } = await api.post<{ id: number }>('/attachments', formData);
      edit(i, { coverAttachmentId: att.id });
    } catch {
      setUploadError('Cover upload failed. Please try again.');
    } finally {
      setUploadingIndex(null);
    }
  };

  const save = async () => {
    const cleaned = books
      .map((b) => ({ ...b, title: b.title.trim(), author: b.author.trim(), reader: b.reader.trim() }))
      .filter((b) => b.title.length > 0);
    await update.mutateAsync({ books: cleaned });
    setDirty(false);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-heading">📚 Currently reading</h3>
      <p className="text-xs text-muted">What the household is reading right now. Progress and cover are optional.</p>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : books.length === 0 ? (
        <p className="text-sm text-muted">No books yet.</p>
      ) : (
        <ul className="space-y-3">
          {books.map((book, i) => (
            <li key={book.id ?? `new-${i}`} className="rounded-card border border-th-border bg-card-alt p-3">
              <div className="flex gap-3">
                <div className="shrink-0">
                  {book.coverAttachmentId ? (
                    <img src={`/api/v1/attachments/${book.coverAttachmentId}/download`} alt="" className="h-20 w-14 rounded object-cover" />
                  ) : (
                    <div className="h-20 w-14 rounded border border-dashed border-th-border flex items-center justify-center text-xl" aria-hidden>📖</div>
                  )}
                  <label className="mt-1 block text-center text-[11px] text-link cursor-pointer">
                    {uploadingIndex === i ? 'Uploading…' : book.coverAttachmentId ? 'Change' : 'Cover'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingIndex !== null} onChange={(e) => uploadCover(i, e.target.files?.[0])} />
                  </label>
                </div>
                <div className="grid flex-1 gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Title"
                    value={book.title}
                    onChange={(e) => edit(i, { title: e.target.value })}
                    className="w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Author"
                    value={book.author}
                    onChange={(e) => edit(i, { author: e.target.value })}
                    className="w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Who’s reading it"
                    value={book.reader}
                    onChange={(e) => edit(i, { reader: e.target.value })}
                    className="w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted md:col-span-2">
                    Progress
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={book.progress ?? 0}
                      onChange={(e) => edit(i, { progress: Number(e.target.value) })}
                      className="flex-1 accent-emerald-600"
                    />
                    <span className="w-10 text-right tabular-nums">{book.progress == null ? '—' : `${book.progress}%`}</span>
                    {book.progress != null && (
                      <button type="button" onClick={() => edit(i, { progress: null })} className="text-link">clear</button>
                    )}
                  </label>
                </div>
                <button type="button" onClick={() => remove(i)} aria-label="Remove book" className="self-start text-muted hover:text-red-600 text-lg leading-none">×</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={add} className="btn-secondary btn-pill px-4 py-2 text-sm">+ Add book</button>
        <button type="button" onClick={save} disabled={!dirty || update.isPending} className="btn-primary btn-pill px-5 py-2 text-sm disabled:opacity-50">
          {update.isPending ? 'Saving…' : 'Save books'}
        </button>
        {update.isError && <span className="text-sm text-red-600">Couldn’t save.</span>}
      </div>
    </div>
  );
}

/* ─── Display PIN ─── */

function DisplayPinEditor() {
  const { user, updateUser } = useAuth();
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'idle' | 'set' | 'clear'>('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hasPin = Boolean(user?.hasPin);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'set' && !/^\d{4,8}$/.test(pin)) {
      setError('PIN must be 4 to 8 digits.');
      return;
    }
    setBusy(true);
    try {
      const updated = await setDisplayPin(password, mode === 'clear' ? null : pin);
      updateUser(updated);
      setMode('idle');
      setPin('');
      setPassword('');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      setError(code === 'WRONG_PASSWORD' ? 'Password is incorrect.' : 'Couldn’t update the PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-heading">🔒 Display PIN <span className="font-normal text-muted">(optional)</span></h3>
      <p className="text-xs text-muted">
        With a PIN set, leaving guest mode or opening its settings asks for it, so a visitor can’t tap through to the family dashboard.
        Without one, exit is a plain tap. Currently: <strong className="text-primary">{hasPin ? 'PIN set' : 'no PIN'}</strong>.
      </p>

      {mode === 'idle' ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('set')} className="btn-primary btn-pill px-4 py-2 text-sm">
            {hasPin ? 'Change PIN' : 'Set a PIN'}
          </button>
          {hasPin && (
            <button type="button" onClick={() => setMode('clear')} className="btn-secondary btn-pill px-4 py-2 text-sm">
              Remove PIN
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          {mode === 'set' && (
            <label className="text-sm font-semibold text-form-label">
              New PIN (4–8 digits)
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="mt-1 w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm font-normal tracking-widest"
                autoComplete="off"
              />
            </label>
          )}
          <label className="text-sm font-semibold text-form-label">
            Your password (to confirm)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-th-border bg-input px-3 py-2 text-sm font-normal"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={busy || !password} className="btn-primary btn-pill px-5 py-2 text-sm disabled:opacity-50">
              {busy ? 'Saving…' : mode === 'clear' ? 'Remove PIN' : 'Save PIN'}
            </button>
            <button type="button" onClick={() => { setMode('idle'); setError(''); }} className="btn-secondary btn-pill px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
