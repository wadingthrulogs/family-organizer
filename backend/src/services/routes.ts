import { logger } from '../lib/logger.js';

export type TravelMode = 'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' | 'TRANSIT';

export interface RouteEtaResult {
  durationSeconds: number;
  staticDurationSeconds: number;
  distanceMeters: number;
  fetchedAt: string;
}

export class RoutesApiError extends Error {
  constructor(
    message: string,
    public code: 'INVALID_API_KEY' | 'REQUEST_FAILED' | 'NO_ROUTE' | 'BAD_REQUEST',
    public status = 502,
  ) {
    super(message);
  }
}

interface CacheEntry {
  data: RouteEtaResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(origin: string, destination: string, mode: TravelMode) {
  return `${origin}|${destination}|${mode}`;
}

function getCached(key: string): RouteEtaResult | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCached(key: string, data: RouteEtaResult) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Google returns duration as "NNs" — parse to integer seconds.
function parseDurationSeconds(raw: unknown): number {
  if (typeof raw !== 'string') return 0;
  const match = raw.match(/^(\d+)s$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function fetchRouteEta(params: {
  origin: string;
  destination: string;
  mode: TravelMode;
  apiKey: string;
}): Promise<RouteEtaResult> {
  const { origin, destination, mode, apiKey } = params;

  const key = cacheKey(origin, destination, mode);
  const cached = getCached(key);
  if (cached) return cached;

  // TRAFFIC_AWARE only makes sense for DRIVE/TWO_WHEELER. Routes API rejects
  // it for WALK/BICYCLE/TRANSIT.
  const routingPreference =
    mode === 'DRIVE' || mode === 'TWO_WHEELER' ? 'TRAFFIC_AWARE' : undefined;

  const body: Record<string, unknown> = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: mode,
  };
  if (routingPreference) body.routingPreference = routingPreference;

  let response: Response;
  try {
    response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error('Routes API network error', { err });
    throw new RoutesApiError('Failed to reach Google Routes API', 'REQUEST_FAILED');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error('Routes API error', { status: response.status, text });
    if (response.status === 400) {
      throw new RoutesApiError('Routes API rejected the request (bad address?)', 'BAD_REQUEST', 400);
    }
    if (response.status === 401 || response.status === 403) {
      throw new RoutesApiError('Google Maps API key rejected — verify key and enabled APIs', 'INVALID_API_KEY');
    }
    throw new RoutesApiError('Google Routes API request failed', 'REQUEST_FAILED');
  }

  const json = (await response.json()) as {
    routes?: Array<{
      duration?: string;
      staticDuration?: string;
      distanceMeters?: number;
    }>;
  };

  const first = json.routes?.[0];
  if (!first) {
    throw new RoutesApiError('No route found between addresses', 'NO_ROUTE', 404);
  }

  const result: RouteEtaResult = {
    durationSeconds: parseDurationSeconds(first.duration),
    staticDurationSeconds: parseDurationSeconds(first.staticDuration),
    distanceMeters: first.distanceMeters ?? 0,
    fetchedAt: new Date().toISOString(),
  };

  setCached(key, result);
  return result;
}
