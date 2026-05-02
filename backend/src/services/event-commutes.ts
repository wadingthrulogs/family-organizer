import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { isObviouslyNotAddress, normalizeLocation } from '../utils/location-filter.js';
import { fetchRouteEta, RoutesApiError } from './routes.js';

const DEFAULT_LOOKAHEAD_MINUTES = 90;
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const METERS_PER_MILE = 1609.344;

export interface EventCommute {
  eventId: number;
  title: string;
  startAt: string;
  location: string;
  durationMinutes?: number;
  staticDurationMinutes?: number;
  delayMinutes?: number;
  distanceMiles?: number;
  leaveByISO?: string;
  fetchedAt?: string;
  error?: { code: string; message: string };
}

interface FetchOpts {
  homeAddress: string;
  apiKey: string;
  lookaheadMinutes?: number;
  now?: Date;
}

export async function getEventCommutes(opts: FetchOpts): Promise<EventCommute[]> {
  const lookahead = opts.lookaheadMinutes ?? DEFAULT_LOOKAHEAD_MINUTES;
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + lookahead * 60 * 1000);

  const events = await prisma.familyEvent.findMany({
    where: {
      deleted: false,
      allDay: false,
      location: { not: null },
      startAt: { gte: now, lt: horizon },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true, title: true, startAt: true, location: true },
  });

  if (events.length === 0) return [];

  // Layer 1: regex skip-list. Drop events whose location is obviously
  // non-routable before any DB or API work.
  type Candidate = { id: number; title: string; startAt: Date; rawLocation: string; normalized: string };
  const candidates: Candidate[] = [];
  for (const e of events) {
    const raw = (e.location ?? '').trim();
    if (!raw) continue;
    if (isObviouslyNotAddress(raw)) continue;
    candidates.push({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      rawLocation: raw,
      normalized: normalizeLocation(raw),
    });
  }

  if (candidates.length === 0) return [];

  // Layer 3: negative cache lookup. Skip locations Routes API has already
  // refused inside the TTL window.
  const uniqueNormalized = Array.from(new Set(candidates.map((c) => c.normalized)));
  const cachedRows = await prisma.locationGeocodeCache.findMany({
    where: {
      location: { in: uniqueNormalized },
      expiresAt: { gt: now },
    },
    select: { location: true, reason: true },
  });
  const cachedSet = new Map(cachedRows.map((r) => [r.location, r.reason]));

  // Group surviving candidates by normalized location for dedupe.
  const groups = new Map<string, Candidate[]>();
  const cachedFailures: EventCommute[] = [];
  for (const c of candidates) {
    const cachedReason = cachedSet.get(c.normalized);
    if (cachedReason) {
      cachedFailures.push({
        eventId: c.id,
        title: c.title,
        startAt: c.startAt.toISOString(),
        location: c.rawLocation,
        error: { code: cachedReason, message: 'Location not routable (cached)' },
      });
      continue;
    }
    const list = groups.get(c.normalized);
    if (list) list.push(c);
    else groups.set(c.normalized, [c]);
  }

  const liveResults: EventCommute[] = [];

  for (const [, group] of groups) {
    const rep = group[0];
    try {
      const eta = await fetchRouteEta({
        origin: opts.homeAddress,
        destination: rep.rawLocation,
        mode: 'DRIVE',
        apiKey: opts.apiKey,
      });
      const durationMinutes = Math.round(eta.durationSeconds / 60);
      const staticMinutes = Math.round(eta.staticDurationSeconds / 60);
      const delayMinutes = Math.round((eta.durationSeconds - eta.staticDurationSeconds) / 60);
      const distanceMiles = Number((eta.distanceMeters / METERS_PER_MILE).toFixed(1));

      for (const member of group) {
        const leaveBy = new Date(member.startAt.getTime() - eta.durationSeconds * 1000);
        liveResults.push({
          eventId: member.id,
          title: member.title,
          startAt: member.startAt.toISOString(),
          location: member.rawLocation,
          durationMinutes,
          staticDurationMinutes: staticMinutes,
          delayMinutes,
          distanceMiles,
          leaveByISO: leaveBy.toISOString(),
          fetchedAt: eta.fetchedAt,
        });
      }
    } catch (err) {
      const code = err instanceof RoutesApiError ? err.code : 'REQUEST_FAILED';
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (err instanceof RoutesApiError && (code === 'NO_ROUTE' || code === 'BAD_REQUEST')) {
        const expiresAt = new Date(now.getTime() + NEGATIVE_CACHE_TTL_MS);
        try {
          await prisma.locationGeocodeCache.upsert({
            where: { location: rep.normalized },
            update: { reason: code, lastAttemptAt: now, expiresAt },
            create: { location: rep.normalized, reason: code, lastAttemptAt: now, expiresAt },
          });
        } catch (cacheErr) {
          logger.warn('LocationGeocodeCache upsert failed', { err: cacheErr });
        }
      }

      for (const member of group) {
        liveResults.push({
          eventId: member.id,
          title: member.title,
          startAt: member.startAt.toISOString(),
          location: member.rawLocation,
          error: { code, message },
        });
      }
    }
  }

  return [...liveResults, ...cachedFailures].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}
