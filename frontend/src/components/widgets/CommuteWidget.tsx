import { lazy, Suspense } from 'react';
import { useActiveCommuteEtas } from '../../hooks/useCommute';
import { useWidgetSize } from '../../hooks/useWidgetSize';
import type { CommuteEta, CommuteEtaError, EventCommute, UpcomingCommute } from '../../types/commute';

const CommuteMap = lazy(() => import('./CommuteMap'));

const MAP_MIN_WIDTH = 300;
const MAP_HEIGHT = 110;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'am' : 'pm';
  return `${hh}:${m.toString().padStart(2, '0')}${ampm}`;
}

function upcomingHint(upcoming: UpcomingCommute): string {
  const when = upcoming.dayOffset === 0
    ? `today ${minutesToHHMM(upcoming.showStartMin)}`
    : upcoming.dayOffset === 1
      ? `tomorrow ${minutesToHHMM(upcoming.showStartMin)}`
      : `${DAY_LABELS[(new Date().getDay() + upcoming.dayOffset) % 7]} ${minutesToHHMM(upcoming.showStartMin)}`;
  return `Next: ${upcoming.name} at ${when}`;
}

type TrafficLevel = 'clear' | 'light' | 'moderate' | 'heavy';

function trafficLevel(delayMinutes: number, staticMinutes: number | undefined): TrafficLevel {
  const base = staticMinutes && staticMinutes > 0 ? staticMinutes : 1;
  const ratio = delayMinutes / base;
  if (delayMinutes <= 1 || ratio <= 0.05) return 'clear';
  if (ratio <= 0.15) return 'light';
  if (ratio <= 0.30) return 'moderate';
  return 'heavy';
}

function delayTone(delayMinutes: number, staticMinutes?: number) {
  const level = trafficLevel(delayMinutes, staticMinutes);
  const delaySuffix = delayMinutes > 0 ? ` +${delayMinutes} min` : '';
  if (level === 'clear') {
    return { bg: 'bg-emerald-500/20', text: 'text-emerald-600', label: 'Clear' };
  }
  if (level === 'light') {
    return { bg: 'bg-amber-500/15', text: 'text-amber-700', label: `Light traffic${delaySuffix}` };
  }
  if (level === 'moderate') {
    return { bg: 'bg-amber-500/25', text: 'text-amber-800', label: `Moderate traffic${delaySuffix}` };
  }
  return { bg: 'bg-red-500/25', text: 'text-red-700', label: `Heavy traffic${delaySuffix}` };
}

function RouteRow({ eta, compact, mapboxToken, showMap }: { eta: CommuteEta; compact: boolean; mapboxToken?: string; showMap: boolean }) {
  const tone = delayTone(eta.delayMinutes, eta.staticDurationMinutes);
  const renderMap = showMap && !!eta.polyline && !!mapboxToken;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-th-border-light bg-th-bg/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95em] font-semibold text-primary">{eta.name}</p>
          {!compact && (
            <p className="truncate text-[0.8em] text-muted">
              {eta.distanceMiles} mi · {eta.destAddress}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            style={{ fontVariantNumeric: 'tabular-nums' }}
            className="text-[1.6em] font-bold text-primary leading-none"
          >
            {eta.durationMinutes}
          </span>
          <span className="text-[0.75em] text-muted">min</span>
          {eta.durationMinutes > 0 ? (
            <span className={`rounded-full px-2 py-0.5 text-[0.7em] font-medium ${tone.bg} ${tone.text}`}>
              {tone.label}
            </span>
          ) : null}
        </div>
      </div>
      {renderMap && (
        <Suspense fallback={<div style={{ height: MAP_HEIGHT }} className="rounded-lg bg-th-bg/40 animate-pulse" />}>
          <CommuteMap
            polyline={eta.polyline!}
            congestion={eta.congestion}
            mapboxToken={mapboxToken!}
            height={MAP_HEIGHT}
          />
        </Suspense>
      )}
    </div>
  );
}

function ErrorRow({ error }: { error: CommuteEtaError }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.95em] font-semibold text-red-700">{error.name}</p>
        <p className="truncate text-[0.8em] text-red-600">{error.error.message}</p>
      </div>
    </div>
  );
}

function formatTimeOfDay(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'am' : 'pm';
  return `${hh}:${m.toString().padStart(2, '0')}${ampm}`;
}

function leaveByLabel(leaveByISO: string): string {
  const leaveBy = new Date(leaveByISO);
  const diffMin = Math.round((leaveBy.getTime() - Date.now()) / 60000);
  if (diffMin <= -1) return `Should have left ${Math.abs(diffMin)}m ago`;
  if (diffMin <= 0) return 'Leave now';
  return `Leave by ${formatTimeOfDay(leaveBy)} (in ${diffMin}m)`;
}

function EventCommuteRow({ ev, compact, mapboxToken, showMap }: { ev: EventCommute; compact: boolean; mapboxToken?: string; showMap: boolean }) {
  if (ev.error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-th-border-light bg-th-bg/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9em] font-semibold text-muted">{ev.title}</p>
          <p className="truncate text-[0.75em] text-faint">
            {ev.location} <span className="italic">(unroutable)</span>
          </p>
        </div>
      </div>
    );
  }
  const tone = delayTone(ev.delayMinutes ?? 0, ev.staticDurationMinutes);
  const renderMap = showMap && !!ev.polyline && !!mapboxToken;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-th-border-light bg-th-bg/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.95em] font-semibold text-primary">{ev.title}</p>
          <p className="truncate text-[0.8em] text-muted">
            {ev.leaveByISO ? leaveByLabel(ev.leaveByISO) : null}
            {!compact && ev.location ? <> · {ev.location}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            style={{ fontVariantNumeric: 'tabular-nums' }}
            className="text-[1.4em] font-bold text-primary leading-none"
          >
            {ev.durationMinutes}
          </span>
          <span className="text-[0.7em] text-muted">min</span>
          {ev.durationMinutes !== undefined && ev.durationMinutes > 0 ? (
            <span className={`rounded-full px-2 py-0.5 text-[0.7em] font-medium ${tone.bg} ${tone.text}`}>
              {tone.label}
            </span>
          ) : null}
        </div>
      </div>
      {renderMap && (
        <Suspense fallback={<div style={{ height: MAP_HEIGHT }} className="rounded-lg bg-th-bg/40 animate-pulse" />}>
          <CommuteMap
            polyline={ev.polyline!}
            congestion={ev.congestion}
            mapboxToken={mapboxToken!}
            height={MAP_HEIGHT}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function CommuteWidget() {
  const { ref, width, baseFontSize } = useWidgetSize();
  const { data, isLoading, isError, error } = useActiveCommuteEtas();

  const compact = width < 280;

  const containerCls =
    'rounded-2xl p-3 bg-[var(--color-card)] border border-[var(--color-border)] h-full overflow-hidden flex flex-col gap-2';

  if (isLoading) {
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className={`${containerCls} animate-pulse justify-center`}>
        <p className="text-[var(--color-text-secondary)] text-center">Loading commute…</p>
      </div>
    );
  }

  if (isError) {
    const msg = (error as { response?: { data?: { error?: { message?: string; code?: string } } } })?.response?.data?.error;
    const isConfig = msg?.code === 'HOME_ADDRESS_NOT_SET' || msg?.code === 'MAPBOX_TOKEN_NOT_SET';
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className={`${containerCls} justify-center`}>
        <p className="text-[var(--color-text-secondary)] text-center text-[0.95em]">
          {isConfig ? (
            <>🚗 Set home address &amp; Mapbox token in <strong>Settings → Commute</strong></>
          ) : (
            <>⚠️ {msg?.message ?? 'Commute unavailable'}</>
          )}
        </p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const eventCommutes = data?.eventCommutes ?? [];
  const mapboxToken = data?.mapboxToken;
  const showMap = width >= MAP_MIN_WIDTH;

  if (items.length === 0 && eventCommutes.length === 0) {
    const upcoming = data?.upcoming;
    return (
      <div ref={ref} style={{ fontSize: baseFontSize }} className={`${containerCls} justify-center`}>
        <p className="text-center text-[var(--color-text-secondary)] text-[1em]">🚗 No commutes right now</p>
        {upcoming && (
          <p className="text-center text-[0.85em] text-[var(--color-text-secondary)]">{upcomingHint(upcoming)}</p>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ fontSize: baseFontSize }} className={containerCls}>
      <div className="shrink-0 flex items-center justify-between">
        <span className="text-[0.85em] font-semibold text-muted">Commute</span>
        {data?.upcoming && items.length === 0 && (
          <span className="text-[0.7em] text-faint">{upcomingHint(data.upcoming)}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2">
        {items.map((item) =>
          item.ok ? (
            <RouteRow key={item.data.routeId} eta={item.data} compact={compact} mapboxToken={mapboxToken} showMap={showMap} />
          ) : (
            <ErrorRow key={item.data.routeId} error={item.data} />
          )
        )}
        {eventCommutes.length > 0 && (
          <>
            {items.length > 0 && (
              <span className="mt-1 text-[0.7em] font-semibold uppercase tracking-wide text-faint">
                Upcoming events
              </span>
            )}
            {eventCommutes.map((ev) => (
              <EventCommuteRow key={ev.eventId} ev={ev} compact={compact} mapboxToken={mapboxToken} showMap={showMap} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
