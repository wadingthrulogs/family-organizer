import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { loadCommuteConfig } from './settings.js';
import {
  fetchRouteEta,
  RoutesApiError,
  type TravelMode,
} from '../services/routes.js';

export const commuteRouter = Router();
commuteRouter.use(requireAuth);

/* ─── Schemas ─── */

const travelModeEnum = z.enum(['DRIVE', 'BICYCLE', 'WALK', 'TWO_WHEELER', 'TRANSIT']);

const daysOfWeekRegex = /^(?:[0-6])(?:,[0-6])*$/;

const createRouteSchema = z.object({
  name:         z.string().trim().min(1).max(100),
  destAddress:  z.string().trim().min(1).max(300),
  travelMode:   travelModeEnum.default('DRIVE'),
  showStartMin: z.number().int().min(0).max(1439),
  showEndMin:   z.number().int().min(0).max(1439),
  daysOfWeek:   z.string().regex(daysOfWeekRegex).default('1,2,3,4,5'),
  sortOrder:    z.number().int().min(0).max(999).default(0),
  active:       z.boolean().default(true),
}).refine((v) => v.showEndMin > v.showStartMin, {
  message: 'showEndMin must be greater than showStartMin',
  path: ['showEndMin'],
});

const updateRouteSchema = z.object({
  name:         z.string().trim().min(1).max(100).optional(),
  destAddress:  z.string().trim().min(1).max(300).optional(),
  travelMode:   travelModeEnum.optional(),
  showStartMin: z.number().int().min(0).max(1439).optional(),
  showEndMin:   z.number().int().min(0).max(1439).optional(),
  daysOfWeek:   z.string().regex(daysOfWeekRegex).optional(),
  sortOrder:    z.number().int().min(0).max(999).optional(),
  active:       z.boolean().optional(),
});

const routeIdSchema = z.object({
  routeId: z.coerce.number().int().positive(),
});

/* ─── Helpers ─── */

function metersToMiles(m: number) {
  return m / 1609.344;
}

function shapeEta(route: {
  id: number;
  name: string;
  destAddress: string;
  travelMode: string;
  showStartMin: number;
  showEndMin: number;
  daysOfWeek: string;
}, eta: {
  durationSeconds: number;
  staticDurationSeconds: number;
  distanceMeters: number;
  fetchedAt: string;
}, homeAddress: string) {
  const delaySeconds = eta.durationSeconds - eta.staticDurationSeconds;
  return {
    routeId: route.id,
    name: route.name,
    destAddress: route.destAddress,
    travelMode: route.travelMode,
    showStartMin: route.showStartMin,
    showEndMin: route.showEndMin,
    daysOfWeek: route.daysOfWeek,
    homeAddress,
    durationMinutes: Math.round(eta.durationSeconds / 60),
    staticDurationMinutes: Math.round(eta.staticDurationSeconds / 60),
    delayMinutes: Math.round(delaySeconds / 60),
    distanceMeters: eta.distanceMeters,
    distanceMiles: Number(metersToMiles(eta.distanceMeters).toFixed(1)),
    fetchedAt: eta.fetchedAt,
  };
}

function sendRoutesApiError(
  res: Parameters<Parameters<typeof commuteRouter.get>[1]>[1],
  err: unknown,
): boolean {
  if (err instanceof RoutesApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return true;
  }
  return false;
}

/* ─── Route CRUD ─── */

commuteRouter.get(
  '/routes',
  asyncHandler(async (_req, res) => {
    const items = await prisma.commuteRoute.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ items, total: items.length });
  })
);

commuteRouter.post(
  '/routes',
  asyncHandler(async (req, res) => {
    const payload = createRouteSchema.parse(req.body ?? {});
    const created = await prisma.commuteRoute.create({ data: payload });
    res.status(201).json(created);
  })
);

commuteRouter.patch(
  '/routes/:routeId',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdSchema.parse(req.params);
    const payload = updateRouteSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    // If both start/end are updated, enforce ordering
    if (
      payload.showStartMin !== undefined &&
      payload.showEndMin !== undefined &&
      payload.showEndMin <= payload.showStartMin
    ) {
      return res.status(400).json({ error: { code: 'INVALID_WINDOW', message: 'showEndMin must be greater than showStartMin' } });
    }

    try {
      const updated = await prisma.commuteRoute.update({
        where: { id: routeId },
        data: payload,
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Commute route not found' } });
      }
      throw err;
    }
  })
);

commuteRouter.delete(
  '/routes/:routeId',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdSchema.parse(req.params);
    try {
      await prisma.commuteRoute.delete({ where: { id: routeId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Commute route not found' } });
      }
      throw err;
    }
  })
);

/* ─── ETA endpoints ─── */

// Single route ETA — used for admin/debug; widget uses /etas/active.
commuteRouter.get(
  '/routes/:routeId/eta',
  asyncHandler(async (req, res) => {
    const { routeId } = routeIdSchema.parse(req.params);

    const route = await prisma.commuteRoute.findUnique({ where: { id: routeId } });
    if (!route) {
      return res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Commute route not found' } });
    }

    const cfg = await loadCommuteConfig();
    if (!cfg.homeAddress) {
      return res.status(400).json({ error: { code: 'HOME_ADDRESS_NOT_SET', message: 'Home address not configured in settings' } });
    }
    if (!cfg.googleMapsApiKey) {
      return res.status(400).json({ error: { code: 'MAPS_API_KEY_NOT_SET', message: 'Google Maps API key not configured in settings' } });
    }

    try {
      const eta = await fetchRouteEta({
        origin: cfg.homeAddress,
        destination: route.destAddress,
        mode: route.travelMode as TravelMode,
        apiKey: cfg.googleMapsApiKey,
      });
      res.json(shapeEta(route, eta, cfg.homeAddress));
    } catch (err) {
      if (sendRoutesApiError(res, err)) return;
      throw err;
    }
  })
);

// Batch ETA for routes active in the current time window.
commuteRouter.get(
  '/etas/active',
  asyncHandler(async (_req, res) => {
    const cfg = await loadCommuteConfig();
    if (!cfg.homeAddress) {
      return res.status(400).json({ error: { code: 'HOME_ADDRESS_NOT_SET', message: 'Home address not configured in settings' } });
    }
    if (!cfg.googleMapsApiKey) {
      return res.status(400).json({ error: { code: 'MAPS_API_KEY_NOT_SET', message: 'Google Maps API key not configured in settings' } });
    }

    const routes = await prisma.commuteRoute.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const now = new Date();
    const minutesOfDay = now.getHours() * 60 + now.getMinutes();
    const today = String(now.getDay());

    const activeRoutes = routes.filter((r) => {
      if (minutesOfDay < r.showStartMin || minutesOfDay >= r.showEndMin) return false;
      const days = r.daysOfWeek.split(',').map((d) => d.trim());
      return days.includes(today);
    });

    const upcomingRoute = !activeRoutes.length
      ? findUpcomingRoute(routes, minutesOfDay, now.getDay())
      : null;

    const items = await Promise.all(
      activeRoutes.map(async (route) => {
        try {
          const eta = await fetchRouteEta({
            origin: cfg.homeAddress!,
            destination: route.destAddress,
            mode: route.travelMode as TravelMode,
            apiKey: cfg.googleMapsApiKey!,
          });
          return { ok: true as const, data: shapeEta(route, eta, cfg.homeAddress!) };
        } catch (err) {
          const code = err instanceof RoutesApiError ? err.code : 'REQUEST_FAILED';
          const message = err instanceof Error ? err.message : 'Unknown error';
          return {
            ok: false as const,
            data: {
              routeId: route.id,
              name: route.name,
              destAddress: route.destAddress,
              travelMode: route.travelMode,
              showStartMin: route.showStartMin,
              showEndMin: route.showEndMin,
              daysOfWeek: route.daysOfWeek,
              homeAddress: cfg.homeAddress!,
              error: { code, message },
            },
          };
        }
      })
    );

    res.json({
      items,
      total: items.length,
      upcoming: upcomingRoute,
    });
  })
);

// Find the next route (today later or tomorrow+) to show as an "upcoming" hint.
function findUpcomingRoute(
  routes: Array<{
    id: number;
    name: string;
    showStartMin: number;
    showEndMin: number;
    daysOfWeek: string;
  }>,
  minutesOfDay: number,
  todayDow: number,
): { routeId: number; name: string; showStartMin: number; showEndMin: number; dayOffset: number } | null {
  let best: { route: typeof routes[number]; dayOffset: number } | null = null;

  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayDow + offset) % 7;
    for (const r of routes) {
      const days = r.daysOfWeek.split(',').map((d) => d.trim());
      if (!days.includes(String(dow))) continue;
      if (offset === 0 && r.showStartMin <= minutesOfDay) continue;
      if (!best || offset < best.dayOffset) {
        best = { route: r, dayOffset: offset };
      }
    }
    if (best) break;
  }

  if (!best) return null;
  return {
    routeId: best.route.id,
    name: best.route.name,
    showStartMin: best.route.showStartMin,
    showEndMin: best.route.showEndMin,
    dayOffset: best.dayOffset,
  };
}
