import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

const rangeQuerySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  calendarId: z.coerce.number().int().positive().optional(),
  includeDeleted: z.coerce.boolean().optional(),
});

const attendeeSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional(),
  responseStatus: z.string().trim().max(40).optional(),
});

const baseEventSchema = z.object({
  linkedCalendarId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.coerce.boolean().optional(),
  timezone: z.string().trim().min(1).max(60),
  colorHex: z.string().trim().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
  location: z.string().trim().max(400).optional(),
  visibility: z.string().trim().max(40).optional(),
  attendees: z.array(attendeeSchema).optional(),
});

const createEventSchema = baseEventSchema.extend({
  source: z.string().trim().max(40).default('LOCAL'),
  sourceEventId: z.string().trim().max(120).optional(),
});

const updateEventSchema = createEventSchema.partial();

const eventIdSchema = z.object({
  eventId: z.coerce.number().int().positive(),
});

const eventInclude = { linkedCalendar: { select: { id: true, displayName: true, colorHex: true } } } as const;

function assertRange(startAt: Date, endAt: Date) {
  if (startAt >= endAt) {
    const error = new Error('Start time must be before end time');
    (error as { status?: number }).status = 400;
    throw error;
  }
}

function serializeAttendees(attendees?: Array<z.infer<typeof attendeeSchema>>) {
  return attendees && attendees.length > 0 ? JSON.stringify(attendees) : null;
}

function deserializeEvent(event: Prisma.FamilyEventGetPayload<{ include: typeof eventInclude }>) {
  const { attendees, ...rest } = event;
  return {
    ...rest,
    attendees: attendees ? (JSON.parse(attendees) as Array<unknown>) : [],
  };
}

calendarRouter.get(
  '/calendars',
  asyncHandler(async (_req, res) => {
    const calendars = await prisma.linkedCalendar.findMany({
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        colorHex: true,
        userId: true,
        accessRole: true,
        googleAccountId: true,
        googleAccount: { select: { email: true } },
      },
    });
    res.json({
      items: calendars.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        colorHex: c.colorHex,
        userId: c.userId,
        accessRole: c.accessRole,
        googleAccountId: c.googleAccountId,
        googleAccountEmail: c.googleAccount?.email ?? null,
      })),
    });
  })
);

calendarRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const { start, end, calendarId, includeDeleted } = rangeQuerySchema.parse(req.query);

    const startAt = new Date(start);
    const endAt = new Date(end);
    assertRange(startAt, endAt);

    const where: Prisma.FamilyEventWhereInput = {
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(calendarId ? { linkedCalendarId: calendarId } : {}),
      ...(includeDeleted ? {} : { deleted: false }),
    };

    const items = await prisma.familyEvent.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: eventInclude,
    });

    res.json({
      items: items.map(deserializeEvent),
      meta: {
        range: { start, end },
        total: items.length,
      },
    });
  })
);

calendarRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const payload = createEventSchema.parse(req.body ?? {});
    const startAt = new Date(payload.startAt);
    const endAt = new Date(payload.endAt);
    assertRange(startAt, endAt);

    const event = await prisma.familyEvent.create({
      data: {
        linkedCalendarId: payload.linkedCalendarId ?? null,
        source: payload.source,
        sourceEventId: payload.sourceEventId ?? null,
        title: payload.title,
        description: payload.description ?? null,
        startAt,
        endAt,
        allDay: payload.allDay ?? false,
        timezone: payload.timezone,
        colorHex: payload.colorHex ?? null,
        location: payload.location ?? null,
        visibility: payload.visibility ?? null,
        attendees: serializeAttendees(payload.attendees),
      },
      include: eventInclude,
    });

    res.status(201).json(deserializeEvent(event));
  })
);

calendarRouter.patch(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const { eventId } = eventIdSchema.parse(req.params);
    const payload = updateEventSchema.parse(req.body ?? {});

    const existing = await prisma.familyEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    }

    const startAt = payload.startAt ? new Date(payload.startAt) : existing.startAt;
    const endAt = payload.endAt ? new Date(payload.endAt) : existing.endAt;
    assertRange(startAt, endAt);

    const data: Prisma.FamilyEventUpdateInput = {
      ...(payload.linkedCalendarId !== undefined
        ? payload.linkedCalendarId
          ? { linkedCalendar: { connect: { id: payload.linkedCalendarId } } }
          : { linkedCalendar: { disconnect: true } }
        : {}),
    };

    if (payload.source !== undefined) data.source = payload.source;
    if (payload.sourceEventId !== undefined) data.sourceEventId = payload.sourceEventId ?? null;
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description ?? null;
    if (payload.startAt !== undefined) data.startAt = startAt;
    if (payload.endAt !== undefined) data.endAt = endAt;
    if (payload.allDay !== undefined) data.allDay = payload.allDay;
    if (payload.timezone !== undefined) data.timezone = payload.timezone;
    if (payload.colorHex !== undefined) data.colorHex = payload.colorHex ?? null;
    if (payload.location !== undefined) data.location = payload.location ?? null;
    if (payload.visibility !== undefined) data.visibility = payload.visibility ?? null;
    if (payload.attendees !== undefined) {
      data.attendees = serializeAttendees(payload.attendees);
    }

    const updated = await prisma.familyEvent.update({
      where: { id: eventId },
      data,
      include: eventInclude,
    });

    res.json(deserializeEvent(updated));
  })
);

calendarRouter.delete(
  '/events/:eventId',
  asyncHandler(async (req, res) => {
    const { eventId } = eventIdSchema.parse(req.params);

    const existing = await prisma.familyEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      return res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    }

    await prisma.familyEvent.update({ where: { id: eventId }, data: { deleted: true } });
    res.status(204).send();
  })
);
