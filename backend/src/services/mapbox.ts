import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

export type TravelMode = 'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' | 'TRANSIT';

export type CongestionClass = 'low' | 'moderate' | 'heavy' | 'severe' | 'unknown';

export interface RouteEtaResult {
  durationSeconds: number;
  staticDurationSeconds: number;
  distanceMeters: number;
  polyline: string;
  congestion: CongestionClass[];
  fetchedAt: string;
}

export class MapboxError extends Error {
  constructor(
    message: string,
    public code:
      | 'INVALID_TOKEN'
      | 'NOT_GEOCODED'
      | 'NO_ROUTE'
      | 'UNSUPPORTED_MODE'
      | 'REQUEST_FAILED',
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
const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

function normalizeAddress(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function profileForMode(mode: TravelMode): string {
  switch (mode) {
    case 'DRIVE':       return 'driving-traffic';
    case 'TWO_WHEELER': return 'driving';
    case 'WALK':        return 'walking';
    case 'BICYCLE':     return 'cycling';
    case 'TRANSIT':
      throw new MapboxError('Mapbox does not support transit routing', 'UNSUPPORTED_MODE', 400);
  }
}

export async function geocodeAddress(
  address: string,
  token: string,
): Promise<{ lng: number; lat: number; placeName: string; relevance: number }> {
  const normalized = normalizeAddress(address);

  const cached = await prisma.geocodeCache.findUnique({ where: { address: normalized } });
  if (cached && cached.expiresAt > new Date()) {
    return {
      lng: cached.lng,
      lat: cached.lat,
      placeName: cached.placeName ?? '',
      relevance: cached.relevance,
    };
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`,
  );
  url.searchParams.set('limit', '1');
  url.searchParams.set('access_token', token);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    logger.error('Mapbox geocoding network error', { err });
    throw new MapboxError('Failed to reach Mapbox Geocoding API', 'REQUEST_FAILED');
  }

  if (response.status === 401) {
    throw new MapboxError('Mapbox token rejected', 'INVALID_TOKEN', 401);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error('Mapbox geocoding error', { status: response.status, text });
    throw new MapboxError('Mapbox Geocoding API request failed', 'REQUEST_FAILED');
  }

  const json = (await response.json()) as {
    features?: Array<{
      center?: [number, number];
      place_name?: string;
      relevance?: number;
    }>;
  };

  const feature = json.features?.[0];
  if (!feature?.center || (feature.relevance ?? 0) < 0.4) {
    throw new MapboxError(`Mapbox could not geocode "${address}"`, 'NOT_GEOCODED', 404);
  }

  const result = {
    lng: feature.center[0],
    lat: feature.center[1],
    placeName: feature.place_name ?? '',
    relevance: feature.relevance ?? 0,
  };

  const expiresAt = new Date(Date.now() + GEOCODE_TTL_MS);
  await prisma.geocodeCache.upsert({
    where: { address: normalized },
    update: { ...result, fetchedAt: new Date(), expiresAt },
    create: { address: normalized, ...result, expiresAt },
  });

  return result;
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

  const profile = profileForMode(mode);

  const [originGeo, destGeo] = await Promise.all([
    geocodeAddress(origin, apiKey),
    geocodeAddress(destination, apiKey),
  ]);

  const coords = `${originGeo.lng},${originGeo.lat};${destGeo.lng},${destGeo.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}`);
  url.searchParams.set('geometries', 'polyline6');
  url.searchParams.set('overview', 'full');
  if (profile === 'driving-traffic') {
    url.searchParams.set('annotations', 'congestion');
  }
  url.searchParams.set('access_token', apiKey);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    logger.error('Mapbox directions network error', { err });
    throw new MapboxError('Failed to reach Mapbox Directions API', 'REQUEST_FAILED');
  }

  if (response.status === 401) {
    throw new MapboxError('Mapbox token rejected', 'INVALID_TOKEN', 401);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.error('Mapbox directions error', { status: response.status, text });
    throw new MapboxError('Mapbox Directions API request failed', 'REQUEST_FAILED');
  }

  const json = (await response.json()) as {
    routes?: Array<{
      duration?: number;
      duration_typical?: number;
      distance?: number;
      geometry?: string;
      legs?: Array<{
        annotation?: { congestion?: string[] };
      }>;
    }>;
    code?: string;
  };

  const first = json.routes?.[0];
  if (!first?.geometry) {
    throw new MapboxError('No route found between addresses', 'NO_ROUTE', 404);
  }

  const congestion: CongestionClass[] = [];
  for (const leg of first.legs ?? []) {
    for (const c of leg.annotation?.congestion ?? []) {
      congestion.push(toCongestionClass(c));
    }
  }

  const result: RouteEtaResult = {
    durationSeconds: Math.round(first.duration ?? 0),
    staticDurationSeconds: Math.round(first.duration_typical ?? first.duration ?? 0),
    distanceMeters: Math.round(first.distance ?? 0),
    polyline: first.geometry,
    congestion,
    fetchedAt: new Date().toISOString(),
  };

  setCached(key, result);
  return result;
}

function toCongestionClass(raw: string): CongestionClass {
  switch (raw) {
    case 'low':      return 'low';
    case 'moderate': return 'moderate';
    case 'heavy':    return 'heavy';
    case 'severe':   return 'severe';
    default:         return 'unknown';
  }
}
