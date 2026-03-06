import { useEffect, useMemo, useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettings, useUpdateSettingsMutation } from '../hooks/useSettings';
import {
  useGoogleConnectMutation,
  useGoogleDisconnectMutation,
  useGoogleIntegration,
  useGoogleSyncMutation,
  useGoogleSyncAllMutation,
} from '../hooks/useGoogleIntegration';
import { api } from '../api/client';
import type { HouseholdSettings } from '../types/settings';
import UserManagement from '../components/UserManagement';
import { useTheme, THEMES, type ThemeId } from '../contexts/ThemeContext';
import { useAuth } from '../hooks/useAuth';

const timezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];

type FormState = {
  householdName: string;
  timezone: string;
  quietStart: string;
  quietEnd: string;
};

const initialState: FormState = {
  householdName: '',
  timezone: 'America/New_York',
  quietStart: '21:30',
  quietEnd: '06:30',
};

function mapSettingsToFormState(settings?: HouseholdSettings | null): FormState {
  if (!settings) {
    return initialState;
  }
  return {
    householdName: settings.householdName ?? '',
    timezone: settings.timezone ?? 'America/New_York',
    quietStart: settings.quietHours?.start ?? '21:30',
    quietEnd: settings.quietHours?.end ?? '06:30',
  };
}

function SettingsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useSettings();
  const updateSettings = useUpdateSettingsMutation();
  const { user } = useAuth();
  const {
    data: integration,
    isLoading: integrationLoading,
    isError: integrationError,
    error: integrationErrorValue,
    refetch: refetchIntegration,
    isFetching: integrationFetching,
  } = useGoogleIntegration();
  const connectGoogle = useGoogleConnectMutation();
  const disconnectGoogle = useGoogleDisconnectMutation();
  const syncGoogle = useGoogleSyncMutation();
  const syncAllGoogle = useGoogleSyncAllMutation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formState, setFormState] = useState<FormState>(initialState);
  const [touched, setTouched] = useState(false);
  const [integrationNotice, setIntegrationNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  // Server configuration state (admin only)
  const [srvOpen, setSrvOpen] = useState(false);
  const [srvAppBaseUrl, setSrvAppBaseUrl] = useState('');
  const [srvGclientId, setSrvGclientId] = useState('');
  const [srvGclientSecret, setSrvGclientSecret] = useState('');
  const [srvOwApiKey, setSrvOwApiKey] = useState('');
  const [srvSmtpHost, setSrvSmtpHost] = useState('');
  const [srvSmtpPort, setSrvSmtpPort] = useState('');
  const [srvSmtpUser, setSrvSmtpUser] = useState('');
  const [srvSmtpPass, setSrvSmtpPass] = useState('');
  const [srvSmtpFrom, setSrvSmtpFrom] = useState('');
  const [srvVapidPub, setSrvVapidPub] = useState('');
  const [srvVapidPriv, setSrvVapidPriv] = useState('');
  const [srvSaving, setSrvSaving] = useState(false);
  const [srvNotice, setSrvNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!data) {
      return;
    }
    setFormState(mapSettingsToFormState(data));
    setTouched(false);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (data.appBaseUrl != null) setSrvAppBaseUrl(data.appBaseUrl);
    if (data.smtpHost != null) setSrvSmtpHost(data.smtpHost);
    if (data.smtpPort != null) setSrvSmtpPort(String(data.smtpPort));
    if (data.smtpUser != null) setSrvSmtpUser(data.smtpUser);
    if (data.smtpFrom != null) setSrvSmtpFrom(data.smtpFrom);
  }, [data]);

  const googleParam = searchParams.get('google');
  const googleReason = searchParams.get('reason');

  useEffect(() => {
    if (!googleParam) {
      return;
    }
    setIntegrationNotice({
      tone: googleParam === 'connected' ? 'success' : 'error',
      message: googleParam === 'connected' ? 'Google Calendar connected. Events will begin syncing shortly.' : mapGoogleReason(googleReason),
    });
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [googleParam, googleReason, searchParams, setSearchParams]);

  const isDirty = useMemo(() => touched, [touched]);

  const handleChange = (key: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setTouched(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await updateSettings.mutateAsync({
      householdName: formState.householdName,
      timezone: formState.timezone,
      quietHours: { start: formState.quietStart, end: formState.quietEnd },
    });
    setTouched(false);
  };

  const handleGoogleConnect = async (loginHint?: string) => {
    try {
      const url = await connectGoogle.mutateAsync({ loginHint });
      window.location.assign(url);
    } catch (err) {
      setIntegrationNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Unable to start Google authorization.',
      });
    }
  };

  const handleGoogleDisconnect = async (accountId: number, email: string) => {
    const confirmed = window.confirm(`Disconnect ${email}? Events will stop syncing but remain visible.`);
    if (!confirmed) {
      return;
    }
    try {
      await disconnectGoogle.mutateAsync(accountId);
      setIntegrationNotice({ tone: 'success', message: `${email} disconnected.` });
    } catch (err) {
      setIntegrationNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Unable to disconnect Google right now.',
      });
    }
  };

  const handleGoogleSync = async (accountId: number) => {
    try {
      const result = await syncGoogle.mutateAsync(accountId);
      setIntegrationNotice({ tone: 'success', message: result?.message ?? 'Sync completed.' });
      await refetchIntegration();
    } catch (err) {
      setIntegrationNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Unable to sync Google Calendar.',
      });
    }
  };

  const saving = updateSettings.isPending;
  const loadError = isError ? (error instanceof Error ? error.message : 'Unable to load settings right now.') : null;
  const saveError = updateSettings.isError
    ? updateSettings.error instanceof Error
      ? updateSettings.error.message
      : 'Unable to save settings right now.'
    : null;
  const successMessage = updateSettings.isSuccess && !saving ? 'Settings saved.' : null;
  const integrationLoadError = integrationError
    ? integrationErrorValue instanceof Error
      ? integrationErrorValue.message
      : 'Unable to load Google integration right now.'
    : null;
  const googleAccounts = integration?.accounts ?? [];
  const googleConnected = googleAccounts.length > 0;
  const connecting = connectGoogle.isPending;
  const disconnecting = disconnectGoogle.isPending;
  const syncing = syncGoogle.isPending || syncAllGoogle.isPending;

  if (isLoading && !data) {
    return (
      <div className="rounded-card bg-card p-6 shadow-soft">
        <div className="h-5 w-1/3 animate-pulse rounded bg-skeleton-bright" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-hover-bg" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-hover-bg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-card p-6 shadow-soft">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-heading">Household Settings</h1>
          <p className="text-sm text-muted">Manage timezone, quiet hours, integrations, and backups.</p>
        </div>
        {isFetching ? <span className="text-xs text-faint">Refreshing…</span> : null}
      </div>
      {loadError ? (
        <div className="mb-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => refetch()} className="rounded-full border border-red-700 px-3 py-1 text-xs font-semibold">
            Retry
          </button>
        </div>
      ) : null}
      {saveError ? <p className="mb-4 text-sm text-red-600">{saveError}</p> : null}
      {successMessage ? <p className="mb-4 text-sm text-emerald-600">{successMessage}</p> : null}
      <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2 text-sm font-semibold text-form-label">
          Household name
          <input
            className="rounded-card border border-th-border px-3 py-2"
            value={formState.householdName}
            onChange={(event) => handleChange('householdName', event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-form-label">
          Timezone
          <select
            className="rounded-card border border-th-border px-3 py-2"
            value={formState.timezone}
            onChange={(event) => handleChange('timezone', event.target.value)}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-form-label">
          Quiet hours start
          <input
            type="time"
            className="rounded-card border border-th-border px-3 py-2"
            value={formState.quietStart}
            onChange={(event) => handleChange('quietStart', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-form-label">
          Quiet hours end
          <input
            type="time"
            className="rounded-card border border-th-border px-3 py-2"
            value={formState.quietEnd}
            onChange={(event) => handleChange('quietEnd', event.target.value)}
          />
        </label>
        <div className="md:col-span-2 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-full border border-th-border px-5 py-2 text-sm"
            disabled={!isDirty || saving}
            onClick={() => {
              setFormState(mapSettingsToFormState(data));
              setTouched(false);
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
            disabled={!isDirty || saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {/* ─── Weather ─── */}
      <WeatherSettings />

      {/* ─── Theme ─── */}
      <ThemePicker />

      {/* ─── Tab Visibility ─── */}
      <section className="mt-10 border-t border-th-border-light pt-6">
        <h2 className="font-semibold text-heading">Tab Visibility</h2>
        <p className="text-sm text-muted mb-4">Choose which tabs to show in the navigation bar.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[
            { key: 'calendar', label: 'Calendar' },
            { key: 'tasks', label: 'Tasks' },
            { key: 'chores', label: 'Chores' },
            { key: 'grocery', label: 'Grocery' },
            { key: 'inventory', label: 'Inventory' },
            { key: 'reminders', label: 'Reminders' },
            { key: 'notifications', label: 'Notifications' },
          ].map((tab) => {
            const hiddenTabs: string[] = (data?.hiddenTabs as string[] | undefined) ?? [];
            const isHidden = hiddenTabs.includes(tab.key);
            return (
              <label
                key={tab.key}
                className={`flex items-center gap-2 rounded-card border px-3 py-2 text-sm cursor-pointer select-none transition ${isHidden ? 'border-th-border bg-hover-bg text-faint' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
              >
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={!isHidden}
                  onChange={async () => {
                    const updated = isHidden
                      ? hiddenTabs.filter((t) => t !== tab.key)
                      : [...hiddenTabs, tab.key];
                    try {
                      await updateSettings.mutateAsync({ hiddenTabs: updated });
                    } catch {
                      // ignore – react-query will show stale
                    }
                  }}
                />
                {tab.label}
              </label>
            );
          })}
        </div>
      </section>

      <section className="mt-10 border-t border-th-border-light pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-heading">Google Calendar</h2>
            <p className="text-sm text-muted">Keep the family board in sync with Google.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${googleConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-th-border bg-hover-bg text-secondary'}`}
            >
              {googleConnected ? `${googleAccounts.length} account${googleAccounts.length > 1 ? 's' : ''} connected` : 'Not connected'}
            </span>
            {integrationFetching ? <span className="text-faint">Refreshing…</span> : null}
            <button
              type="button"
              className="rounded-full border border-th-border px-4 py-1.5 text-xs font-medium text-heading"
              onClick={() => handleGoogleConnect()}
              disabled={connecting}
            >
              {connecting ? 'Preparing…' : googleConnected ? 'Add Google Account' : 'Connect Google'}
            </button>
          </div>
        </div>
        {integrationNotice ? (
          <div
            className={`mt-4 rounded border px-3 py-2 text-sm ${integrationNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
          >
            {integrationNotice.message}
          </div>
        ) : null}
        {integrationLoadError ? (
          <div className="mt-4 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{integrationLoadError}</span>
            <button
              type="button"
              className="rounded-full border border-red-600 px-3 py-1 text-xs font-semibold"
              onClick={() => refetchIntegration()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {integrationLoading ? (
          <div className="mt-4 space-y-3">
            {[0, 1].map((skeleton) => (
              <div key={skeleton} className="h-12 animate-pulse rounded-card bg-hover-bg" />
            ))}
          </div>
        ) : googleAccounts.length > 0 ? (
          <div className="mt-4 space-y-4">
            {googleAccounts.map((account) => (
              <div key={account.id} className="rounded-card border border-th-border-light p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-heading">{account.email}</p>
                    {account.displayName ? <p className="text-xs text-muted">{account.displayName}</p> : null}
                    <p className="text-xs text-faint">Last sync: {formatSyncTimestamp(account.lastSyncedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-th-border px-3 py-1 text-xs"
                      onClick={() => handleGoogleSync(account.id)}
                      disabled={syncing}
                    >
                      {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600"
                      onClick={() => handleGoogleDisconnect(account.id, account.email)}
                      disabled={disconnecting}
                    >
                      {disconnecting ? 'Removing…' : 'Disconnect'}
                    </button>
                  </div>
                </div>
                {account.calendars.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {account.calendars.map((calendar) => (
                      <li key={calendar.id} className="flex items-center justify-between rounded border border-th-border-light px-3 py-2">
                        <p className="text-sm text-heading">{calendar.displayName}</p>
                        {calendar.colorHex ? (
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: calendar.colorHex }} title={calendar.colorHex} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-muted">No calendars found for this account.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Connect to Google Calendar to pull everyone&apos;s existing events into the Organizer timeline.
          </p>
        )}
        {googleAccounts.length > 1 ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-full border border-th-border px-5 py-2 text-sm"
              onClick={async () => {
                try {
                  const result = await syncAllGoogle.mutateAsync();
                  setIntegrationNotice({ tone: 'success', message: result?.message ?? 'All accounts synced.' });
                  await refetchIntegration();
                } catch (err) {
                  setIntegrationNotice({
                    tone: 'error',
                    message: err instanceof Error ? err.message : 'Unable to sync all accounts.',
                  });
                }
              }}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : 'Sync All'}
            </button>
          </div>
        ) : null}
      </section>

      {/* ─── Server Configuration (Admin only) ─── */}
      {user?.role === 'ADMIN' ? (
        <section className="mt-10 border-t border-th-border-light pt-6">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setSrvOpen((o) => !o)}
          >
            <div>
              <h2 className="font-semibold text-heading">Server Configuration</h2>
              <p className="text-sm text-muted">API keys, SMTP, VAPID, and Google OAuth credentials.</p>
            </div>
            <span className="text-lg text-muted select-none">{srvOpen ? '▼' : '▶'}</span>
          </button>

          {srvOpen ? (
            <div className="mt-4 space-y-6">

              {/* App URL */}
              <div className="rounded-card border border-th-border-light p-4 space-y-3">
                <p className="text-sm font-semibold text-heading">App URL</p>
                <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                  App Base URL
                  <input
                    type="url"
                    className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                    value={srvAppBaseUrl}
                    onChange={(e) => setSrvAppBaseUrl(e.target.value)}
                    placeholder="https://your-organizer.example.com"
                  />
                </label>
                <p className="text-xs text-muted">Takes effect on next server restart.</p>
              </div>

              {/* Google OAuth */}
              <div className="rounded-card border border-th-border-light p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">Google OAuth</p>
                  {(data?.googleClientId != null || data?.googleClientSecretSet) ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Credentials configured
                    </span>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                  Client ID
                  <input
                    type="text"
                    className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                    value={srvGclientId}
                    onChange={(e) => setSrvGclientId(e.target.value)}
                    placeholder={data?.googleClientId != null ? 'Leave blank to keep current' : 'Paste your OAuth client ID'}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                  Client Secret
                  <input
                    type="password"
                    className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                    value={srvGclientSecret}
                    onChange={(e) => setSrvGclientSecret(e.target.value)}
                    placeholder={data?.googleClientSecretSet ? 'Leave blank to keep current' : 'Paste your client secret'}
                  />
                </label>

                {/* Required URIs for Google Cloud Console */}
                <div className="rounded-lg border border-th-border-light bg-th-page p-3 space-y-2">
                  <p className="text-xs font-semibold text-heading">Google Cloud Console — Required URIs</p>
                  {(() => {
                    const oauthBase = (srvAppBaseUrl || data?.appBaseUrl || '').replace(/\/$/, '');
                    if (!oauthBase) {
                      return <p className="text-xs text-muted">Set App Base URL above to generate these values.</p>;
                    }
                    const redirectUri = `${oauthBase}/api/v1/integrations/google/callback`;
                    const copyField = (key: string, value: string) => {
                      navigator.clipboard.writeText(value);
                      setCopiedField(key);
                      setTimeout(() => setCopiedField(null), 2000);
                    };
                    return (
                      <div className="space-y-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-form-label">Authorized JavaScript origins</span>
                          <div className="flex gap-2">
                            <input readOnly value={oauthBase} className="min-w-0 flex-1 rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary font-mono" />
                            <button type="button" onClick={() => copyField('origin', oauthBase)} className="shrink-0 rounded-lg border border-th-border px-3 py-2 text-xs font-semibold text-heading hover:bg-th-border transition-colors">
                              {copiedField === 'origin' ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-form-label">Authorized redirect URIs</span>
                          <div className="flex gap-2">
                            <input readOnly value={redirectUri} className="min-w-0 flex-1 rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary font-mono" />
                            <button type="button" onClick={() => copyField('redirect', redirectUri)} className="shrink-0 rounded-lg border border-th-border px-3 py-2 text-xs font-semibold text-heading hover:bg-th-border transition-colors">
                              {copiedField === 'redirect' ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Weather */}
              <div className="rounded-card border border-th-border-light p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">Weather</p>
                  {data?.openweatherApiKeySet ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      API key configured
                    </span>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                  OpenWeather API Key
                  <input
                    type="password"
                    className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                    value={srvOwApiKey}
                    onChange={(e) => setSrvOwApiKey(e.target.value)}
                    placeholder={data?.openweatherApiKeySet ? 'Leave blank to keep current' : 'Paste your API key'}
                  />
                </label>
              </div>

              {/* SMTP */}
              <div className="rounded-card border border-th-border-light p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">Email (SMTP)</p>
                  {data?.smtpPassSet ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      SMTP configured
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Host
                    <input
                      type="text"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvSmtpHost}
                      onChange={(e) => setSrvSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Port
                    <input
                      type="number"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvSmtpPort}
                      onChange={(e) => setSrvSmtpPort(e.target.value)}
                      placeholder="587"
                      min={1}
                      max={65535}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Username
                    <input
                      type="text"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvSmtpUser}
                      onChange={(e) => setSrvSmtpUser(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Password
                    <input
                      type="password"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvSmtpPass}
                      onChange={(e) => setSrvSmtpPass(e.target.value)}
                      placeholder={data?.smtpPassSet ? 'Leave blank to keep current' : 'SMTP password'}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label sm:col-span-2">
                    From address
                    <input
                      type="text"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvSmtpFrom}
                      onChange={(e) => setSrvSmtpFrom(e.target.value)}
                      placeholder="Family Organizer <noreply@example.com>"
                    />
                  </label>
                </div>
              </div>

              {/* VAPID */}
              <div className="rounded-card border border-th-border-light p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">Push Notifications (VAPID)</p>
                  {data?.pushVapidPublicKeySet ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Keys configured
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Public Key
                    <input
                      type="password"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvVapidPub}
                      onChange={(e) => setSrvVapidPub(e.target.value)}
                      placeholder={data?.pushVapidPublicKeySet ? 'Leave blank to keep current' : 'VAPID public key'}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-form-label">
                    Private Key
                    <input
                      type="password"
                      className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint font-mono"
                      value={srvVapidPriv}
                      onChange={(e) => setSrvVapidPriv(e.target.value)}
                      placeholder={data?.pushVapidPrivateKeySet ? 'Leave blank to keep current' : 'VAPID private key'}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-3">
              {srvNotice ? (
                <div
                  className={`rounded border px-3 py-2 text-sm ${srvNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
                >
                  {srvNotice.message}
                </div>
              ) : null}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded-full bg-btn-primary px-6 py-2 text-sm text-btn-primary-text disabled:opacity-50"
                  disabled={srvSaving}
                  onClick={async () => {
                    setSrvSaving(true);
                    setSrvNotice(null);
                    try {
                      await updateSettings.mutateAsync({
                        appBaseUrl:        srvAppBaseUrl || null,
                        googleClientId:    srvGclientId || undefined,
                        googleClientSecret: srvGclientSecret || undefined,
                        openweatherApiKey: srvOwApiKey || undefined,
                        smtpHost:          srvSmtpHost || null,
                        smtpPort:          srvSmtpPort ? parseInt(srvSmtpPort, 10) : null,
                        smtpUser:          srvSmtpUser || null,
                        smtpPass:          srvSmtpPass || undefined,
                        smtpFrom:          srvSmtpFrom || null,
                        pushVapidPublicKey:  srvVapidPub || undefined,
                        pushVapidPrivateKey: srvVapidPriv || undefined,
                      });
                      // Clear write-only secret fields after save
                      setSrvGclientId('');
                      setSrvGclientSecret('');
                      setSrvOwApiKey('');
                      setSrvSmtpPass('');
                      setSrvVapidPub('');
                      setSrvVapidPriv('');
                      setSrvNotice({ tone: 'success', message: 'Server configuration saved.' });
                    } catch (err) {
                      setSrvNotice({
                        tone: 'error',
                        message: err instanceof Error ? err.message : 'Unable to save server configuration.',
                      });
                    } finally {
                      setSrvSaving(false);
                    }
                  }}
                >
                  {srvSaving ? 'Saving…' : 'Save server configuration'}
                </button>
              </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ─── Backup & Export ─── */}
      <div className="mt-10">
        <BackupSection />
      </div>

      {/* ─── User Management (Admin only) ─── */}
      <UserManagement />
    </div>
  );
}

export default SettingsPage;

/* ─── Backup Section ─── */

function BackupSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get('/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `family-organizer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { data } = await api.post('/backup/import', json);
      const counts = data.counts as Record<string, number>;
      const summary = Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      setImportResult(summary ? `Imported: ${summary}` : 'No data imported.');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Import failed. Make sure the file is a valid backup JSON.';
      setImportError(msg);
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section className="rounded-card border border-th-border bg-card p-5 shadow-soft space-y-4">
      <div>
        <h2 className="font-semibold text-heading">Backup & Export</h2>
        <p className="text-xs text-muted">Export your data as a JSON snapshot or import from a previous backup.</p>
      </div>

      {importResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {importResult}
        </div>
      )}
      {importError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {importError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Exporting…' : 'Export backup'}
        </button>
        <button
          type="button"
          className="rounded-full border border-th-border px-5 py-2 text-sm disabled:opacity-50"
          onClick={handleImportClick}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import backup'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </section>
  );
}

function formatSyncTimestamp(value?: string | null) {
  if (!value) {
    return 'pending';
  }
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return 'pending';
  }
}

function mapGoogleReason(code?: string | null) {
  switch (code) {
    case 'state_mismatch':
      return 'We could not verify the Google response. Try again.';
    case 'missing_code':
      return 'Google did not send a verification code. Please try again.';
    case 'missing_refresh_token':
      return 'Google did not grant long-lived access. Try reconnecting and accept the permissions prompt.';
    default:
      return 'Unable to connect to Google Calendar right now.';
  }
}

/* ─── Theme Picker ─── */

function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="mt-10 border-t border-th-border-light pt-6">
      <h2 className="font-semibold text-heading">Theme</h2>
      <p className="text-sm text-muted mb-4">Choose a color theme for the interface.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTheme(t.id)}
              className={`group relative flex flex-col items-center gap-2 rounded-card border-2 p-3 text-sm transition-all ${
                active
                  ? 'border-accent ring-2 ring-accent/30 shadow-soft'
                  : 'border-th-border hover:border-muted'
              }`}
            >
              {/* Color swatch row */}
              <div className="flex w-full gap-1 rounded-md overflow-hidden h-6">
                <div className="flex-1" style={{ backgroundColor: t.colors.bg }} />
                <div className="flex-1" style={{ backgroundColor: t.colors.card }} />
                <div className="flex-1" style={{ backgroundColor: t.colors.accent }} />
                <div className="flex-1" style={{ backgroundColor: t.colors.text }} />
              </div>
              <span className="text-xs font-medium text-primary truncate w-full text-center">
                {t.name}
              </span>
              {active && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-btn-primary-text font-bold">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ─── Weather Settings ─── */

function WeatherSettings() {
  const { data: settings, refetch } = useSettings();
  const [location, setLocation] = useState(settings?.weatherLocation || '');
  const [units, setUnits] = useState(settings?.weatherUnits || 'imperial');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocation(settings.weatherLocation || '');
      setUnits(settings.weatherUnits || 'imperial');
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', { weatherLocation: location, weatherUnits: units });
      await refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 border-t border-th-border-light pt-6">
      <h2 className="font-semibold text-heading">Weather</h2>
      <p className="text-sm text-muted mb-4">Configure the weather widget on your dashboard.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-xs text-muted mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Chicago, IL, US or London, GB"
            className="w-full rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary placeholder:text-faint"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Units</label>
          <select
            value={units}
            onChange={(e) => setUnits(e.target.value as 'imperial' | 'metric')}
            className="rounded-lg border border-th-border bg-th-input px-3 py-2 text-sm text-primary"
          >
            <option value="imperial">°F (Imperial)</option>
            <option value="metric">°C (Metric)</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-btn-primary px-5 py-2 text-sm text-btn-primary-text disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  );
}
