import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import {
  useCommuteRoutes,
  useCreateCommuteRouteMutation,
  useUpdateCommuteRouteMutation,
  useDeleteCommuteRouteMutation,
} from '../../hooks/useCommute';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../hooks/useAuth';
import type { CommuteRoute, TravelMode } from '../../types/commute';

const TRAVEL_MODES: { value: TravelMode; label: string }[] = [
  { value: 'DRIVE', label: 'Drive' },
  { value: 'TRANSIT', label: 'Transit' },
  { value: 'BICYCLE', label: 'Bike' },
  { value: 'WALK', label: 'Walk' },
  { value: 'TWO_WHEELER', label: 'Two-wheeler' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface RouteFormState {
  name: string;
  destAddress: string;
  travelMode: TravelMode;
  startTime: string;
  endTime: string;
  days: Set<number>;
  active: boolean;
}

function emptyForm(): RouteFormState {
  return {
    name: '',
    destAddress: '',
    travelMode: 'DRIVE',
    startTime: '07:00',
    endTime: '09:00',
    days: new Set([1, 2, 3, 4, 5]),
    active: true,
  };
}

function routeToForm(route: CommuteRoute): RouteFormState {
  return {
    name: route.name,
    destAddress: route.destAddress,
    travelMode: route.travelMode,
    startTime: minutesToHHMM(route.showStartMin),
    endTime: minutesToHHMM(route.showEndMin),
    days: new Set(route.daysOfWeek.split(',').map((d) => parseInt(d, 10))),
    active: route.active,
  };
}

export default function CommuteSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: settings, refetch: refetchSettings } = useSettings();
  const { data: routesData, isLoading: routesLoading } = useCommuteRoutes();
  const createRoute = useCreateCommuteRouteMutation();
  const updateRoute = useUpdateCommuteRouteMutation();
  const deleteRoute = useDeleteCommuteRouteMutation();

  const routes = routesData?.items ?? [];

  const [homeAddress, setHomeAddress] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configNotice, setConfigNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setHomeAddress((settings.homeAddress as string | undefined) ?? '');
    }
  }, [settings]);

  const apiKeyConfigured = (settings as { googleMapsApiKeySet?: boolean } | undefined)?.googleMapsApiKeySet === true;

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<RouteFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigNotice(null);
    try {
      const body: Record<string, string> = {};
      body.homeAddress = homeAddress;
      if (apiKey.trim()) {
        body.googleMapsApiKey = apiKey.trim();
      }
      await api.patch('/settings', body);
      await refetchSettings();
      setApiKey('');
      setConfigNotice({ tone: 'success', message: 'Saved.' });
      setTimeout(() => setConfigNotice(null), 2500);
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: { message?: string } } } };
      setConfigNotice({
        tone: 'error',
        message: anyErr?.response?.data?.error?.message ?? 'Failed to save settings.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!confirm('Remove the stored Google Maps API key?')) return;
    setSavingConfig(true);
    try {
      await api.patch('/settings', { googleMapsApiKey: null });
      await refetchSettings();
      setConfigNotice({ tone: 'success', message: 'Key removed.' });
      setTimeout(() => setConfigNotice(null), 2500);
    } catch {
      setConfigNotice({ tone: 'error', message: 'Failed to remove key.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const startAdd = () => {
    setForm(emptyForm());
    setEditingId('new');
    setFormError(null);
  };

  const startEdit = (route: CommuteRoute) => {
    setForm(routeToForm(route));
    setEditingId(route.id);
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError(null);
  };

  const handleSaveRoute = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const startMin = hhmmToMinutes(form.startTime);
    const endMin = hhmmToMinutes(form.endTime);

    if (endMin <= startMin) {
      setFormError('End time must be after start time.');
      return;
    }
    if (form.days.size === 0) {
      setFormError('Select at least one day.');
      return;
    }
    if (!form.name.trim() || !form.destAddress.trim()) {
      setFormError('Name and destination are required.');
      return;
    }

    const daysCsv = Array.from(form.days).sort().join(',');
    const payload = {
      name: form.name.trim(),
      destAddress: form.destAddress.trim(),
      travelMode: form.travelMode,
      showStartMin: startMin,
      showEndMin: endMin,
      daysOfWeek: daysCsv,
      active: form.active,
    };

    try {
      if (editingId === 'new') {
        await createRoute.mutateAsync(payload);
      } else if (typeof editingId === 'number') {
        await updateRoute.mutateAsync({ id: editingId, data: payload });
      }
      setEditingId(null);
    } catch (err) {
      const anyErr = err as { response?: { data?: { error?: { message?: string } } } };
      setFormError(anyErr?.response?.data?.error?.message ?? 'Failed to save route.');
    }
  };

  const handleDeleteRoute = async (id: number) => {
    if (!confirm('Delete this commute route?')) return;
    try {
      await deleteRoute.mutateAsync(id);
    } catch {
      // Swallow — list query will refetch on error via onError unaffected
    }
  };

  const toggleDay = (day: number) => {
    setForm((prev) => {
      const next = new Set(prev.days);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return { ...prev, days: next };
    });
  };

  return (
    <section className="mt-10 border-t border-th-border-light pt-6">
      <h2 className="font-semibold text-heading">Commute / Routes</h2>
      <p className="text-sm text-muted mb-4">
        Configure your home address, Google Maps API key, and destinations. Each route only appears on the Commute widget during its configured time window.
      </p>

      {/* Home address + API key */}
      <form onSubmit={handleSaveConfig} className="flex flex-col gap-3 mb-6">
        <div>
          <label className="block text-xs text-muted mb-1">Home address</label>
          <input
            type="text"
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            placeholder="e.g. 123 Main St, Chicago, IL"
            disabled={!isAdmin}
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint disabled:opacity-60"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-muted">
              Google Maps API key
              {apiKeyConfigured && <span className="ml-2 text-emerald-600">✓ configured</span>}
            </label>
            {apiKeyConfigured && isAdmin && (
              <button
                type="button"
                onClick={handleClearApiKey}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={apiKeyConfigured ? 'Leave blank to keep existing key' : 'Paste your API key'}
            disabled={!isAdmin}
            autoComplete="off"
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint disabled:opacity-60"
          />
          <p className="mt-1 text-xs text-faint">
            Key is stored encrypted. Enable the <strong>Routes API</strong> in Google Cloud Console and restrict the key by HTTP referrer or IP.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingConfig}
              className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
            >
              {savingConfig ? 'Saving…' : 'Save'}
            </button>
            {configNotice && (
              <span className={configNotice.tone === 'success' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
                {configNotice.message}
              </span>
            )}
          </div>
        )}
      </form>

      {/* Routes list */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-heading">Destinations</h3>
        {editingId === null && (
          <button
            type="button"
            onClick={startAdd}
            className="rounded-full border border-th-border px-4 py-1.5 text-xs font-medium text-primary hover:bg-hover-bg"
          >
            + Add route
          </button>
        )}
      </div>

      {routesLoading ? (
        <p className="text-sm text-muted">Loading routes…</p>
      ) : routes.length === 0 && editingId === null ? (
        <p className="text-sm text-muted italic">No routes configured yet.</p>
      ) : null}

      <ul className="space-y-2">
        {routes.map((route) => (
          <li
            key={route.id}
            className="rounded-card border border-th-border-light bg-card p-3"
          >
            {editingId === route.id ? (
              <RouteFormEditor
                form={form}
                setForm={setForm}
                onSave={handleSaveRoute}
                onCancel={cancelEdit}
                toggleDay={toggleDay}
                formError={formError}
                saving={updateRoute.isPending}
              />
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-primary">{route.name}</span>
                    {!route.active && (
                      <span className="text-xs rounded-full bg-hover-bg px-2 py-0.5 text-muted">Paused</span>
                    )}
                  </div>
                  <p className="text-xs text-muted truncate">{route.destAddress}</p>
                  <p className="text-xs text-faint mt-0.5">
                    {TRAVEL_MODES.find((m) => m.value === route.travelMode)?.label} ·{' '}
                    {minutesToHHMM(route.showStartMin)}–{minutesToHHMM(route.showEndMin)} ·{' '}
                    {route.daysOfWeek
                      .split(',')
                      .map((d) => DAY_LABELS[parseInt(d, 10)])
                      .join(' ')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(route)}
                    className="rounded-full border border-th-border px-3 py-1 text-xs text-primary hover:bg-hover-bg"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRoute(route.id)}
                    className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}

        {editingId === 'new' && (
          <li className="rounded-card border border-th-border-light bg-card p-3">
            <RouteFormEditor
              form={form}
              setForm={setForm}
              onSave={handleSaveRoute}
              onCancel={cancelEdit}
              toggleDay={toggleDay}
              formError={formError}
              saving={createRoute.isPending}
            />
          </li>
        )}
      </ul>
    </section>
  );
}

function RouteFormEditor({
  form,
  setForm,
  onSave,
  onCancel,
  toggleDay,
  formError,
  saving,
}: {
  form: RouteFormState;
  setForm: (update: (prev: RouteFormState) => RouteFormState) => void;
  onSave: (e: FormEvent) => void;
  onCancel: () => void;
  toggleDay: (day: number) => void;
  formError: string | null;
  saving: boolean;
}) {
  return (
    <form onSubmit={onSave} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Work"
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Travel mode</label>
          <select
            value={form.travelMode}
            onChange={(e) => setForm((p) => ({ ...p, travelMode: e.target.value as TravelMode }))}
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary"
          >
            {TRAVEL_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Destination address</label>
        <input
          type="text"
          value={form.destAddress}
          onChange={(e) => setForm((p) => ({ ...p, destAddress: e.target.value }))}
          placeholder="e.g. 500 W Madison St, Chicago, IL"
          className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Show from</label>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Show until</label>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted mb-1">Days</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((label, idx) => {
            const selected = form.days.has(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={
                  'rounded-full border px-3 py-1 text-xs font-medium transition ' +
                  (selected
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-th-border bg-hover-bg text-muted')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
        />
        <span>Active</span>
      </label>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-th-border px-4 py-1.5 text-sm text-primary hover:bg-hover-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-btn-primary px-5 py-1.5 text-sm text-btn-primary-text disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
