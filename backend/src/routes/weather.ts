import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { logger } from '../lib/logger.js';

let currentApiKey: string | undefined;

export function setOpenWeatherApiKey(key?: string): void {
  currentApiKey = key || undefined;
}

interface GeoResult {
  lat: number;
  lon: number;
  name: string;
  state?: string;
  country: string;
}

interface CacheEntry {
  data: unknown;
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, ts: Date.now() });
}

const weatherQuerySchema = z.object({
  location: z.string().trim().min(1).max(200),
  units: z.enum(['imperial', 'metric']).default('imperial'),
});

export function weatherRouter(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      if (!currentApiKey) {
        return res.status(501).json({ error: { code: 'WEATHER_NOT_CONFIGURED', message: 'Weather API key not configured' } });
      }

      const { location, units } = weatherQuerySchema.parse(req.query);

      const cacheKey = `${location}|${units}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Geocode the location
      const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${currentApiKey}`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) {
        logger.error('Geocoding failed', { status: geoRes.status });
        if (geoRes.status === 401) {
          return res.status(502).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key — new keys can take up to 2 hours to activate' } });
        }
        return res.status(502).json({ error: { code: 'GEOCODING_FAILED', message: 'Geocoding failed' } });
      }

      const geoData = (await geoRes.json()) as GeoResult[];
      if (!geoData.length) {
        return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found' } });
      }

      const { lat, lon, name, state, country } = geoData[0];
      const locationLabel = state ? `${name}, ${state}` : `${name}, ${country}`;

      // Current weather
      const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${currentApiKey}`;
      const currentRes = await fetch(currentUrl);
      if (!currentRes.ok) {
        logger.error('Weather API failed', { status: currentRes.status });
        if (currentRes.status === 401) {
          return res.status(502).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key — new keys can take up to 2 hours to activate' } });
        }
        return res.status(502).json({ error: { code: 'WEATHER_API_FAILED', message: 'Weather API failed' } });
      }
      const currentData = await currentRes.json() as any;

      // 5-day / 3-hour forecast
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${currentApiKey}`;
      const forecastRes = await fetch(forecastUrl);
      if (!forecastRes.ok) {
        return res.status(502).json({ error: { code: 'FORECAST_API_FAILED', message: 'Forecast API failed' } });
      }
      const forecastData = await forecastRes.json() as any;

      // Collapse 3-hour intervals into daily summaries
      const dailyMap = new Map<string, { temps: number[]; icons: string[]; descriptions: string[]; date: string }>();

      for (const item of forecastData.list) {
        const date = item.dt_txt.split(' ')[0]; // "YYYY-MM-DD"
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { temps: [], icons: [], descriptions: [], date });
        }
        const day = dailyMap.get(date)!;
        day.temps.push(item.main.temp);
        day.icons.push(item.weather[0].icon);
        day.descriptions.push(item.weather[0].description);
      }

      const daily = Array.from(dailyMap.values())
        .slice(0, 5)
        .map((d) => {
          // Pick the most common icon for the day (prefer daytime "d" icons)
          const iconCounts = new Map<string, number>();
          for (const ic of d.icons) {
            iconCounts.set(ic, (iconCounts.get(ic) || 0) + 1);
          }
          let bestIcon = d.icons[0];
          let bestCount = 0;
          for (const [ic, cnt] of iconCounts) {
            if (cnt > bestCount || (cnt === bestCount && ic.endsWith('d'))) {
              bestIcon = ic;
              bestCount = cnt;
            }
          }

          // Most common description
          const descCounts = new Map<string, number>();
          for (const desc of d.descriptions) {
            descCounts.set(desc, (descCounts.get(desc) || 0) + 1);
          }
          let bestDesc = d.descriptions[0];
          let bestDescCount = 0;
          for (const [desc, cnt] of descCounts) {
            if (cnt > bestDescCount) {
              bestDesc = desc;
              bestDescCount = cnt;
            }
          }

          return {
            date: d.date,
            high: Math.round(Math.max(...d.temps)),
            low: Math.round(Math.min(...d.temps)),
            icon: bestIcon,
            description: bestDesc,
          };
        });

      const result = {
        location: locationLabel,
        units,
        current: {
          temp: Math.round(currentData.main.temp),
          feelsLike: Math.round(currentData.main.feels_like),
          humidity: currentData.main.humidity,
          windSpeed: Math.round(currentData.wind.speed),
          icon: currentData.weather[0].icon,
          description: currentData.weather[0].description,
          high: Math.round(currentData.main.temp_max),
          low: Math.round(currentData.main.temp_min),
        },
        daily,
      };

      setCache(cacheKey, result);
      return res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'INVALID_QUERY', message: err.issues[0]?.message ?? 'Invalid query parameters' } });
      }
      logger.error('Weather route error', { err });
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  });

  return router;
}
