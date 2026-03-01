import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

export const remindersRouter = Router();
remindersRouter.use(requireAuth);

const listQuerySchema = z.object({
  enabled: z.coerce.boolean().optional(),
  targetType: z.string().trim().max(50).optional(),
});

const timePattern = /^\d{2}:\d{2}$/;

const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().max(500).optional(),
  targetType: z.string().trim().min(1).max(50),
  targetId: z.coerce.number().int().positive().optional(),
  channelMask: z.coerce.number().int().min(1).default(1),
  leadTimeMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  quietHoursStart: z.string().regex(timePattern).optional(),
  quietHoursEnd: z.string().regex(timePattern).optional(),
  enabled: z.coerce.boolean().default(true),
});

const updateReminderSchema = createReminderSchema.partial();

const reminderIdSchema = z.object({
  reminderId: z.coerce.number().int().positive(),
});

const ownerSelect = { id: true, username: true, colorHex: true } as const;

remindersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { enabled, targetType } = listQuerySchema.parse(req.query);
    const where = {
      ownerUserId: req.session.userId!,
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
      ...(targetType ? { targetType } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.reminder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: ownerSelect } },
      }),
      prisma.reminder.count({ where }),
    ]);

    res.json({ items, total });
  })
);

remindersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = createReminderSchema.parse(req.body ?? {});

    const reminder = await prisma.reminder.create({
      data: {
        ownerUserId: req.session.userId!,
        title: payload.title,
        message: payload.message ?? null,
        targetType: payload.targetType,
        targetId: payload.targetId ?? null,
        channelMask: payload.channelMask,
        leadTimeMinutes: payload.leadTimeMinutes ?? 0,
        quietHoursStart: payload.quietHoursStart ?? null,
        quietHoursEnd: payload.quietHoursEnd ?? null,
        enabled: payload.enabled,
      },
      include: { owner: { select: ownerSelect } },
    });

    res.status(201).json(reminder);
  })
);

remindersRouter.get(
  '/:reminderId',
  asyncHandler(async (req, res) => {
    const { reminderId } = reminderIdSchema.parse(req.params);

    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { owner: { select: ownerSelect } },
    });

    if (!reminder) {
      return res.status(404).json({ error: { code: 'REMINDER_NOT_FOUND', message: 'Reminder not found' } });
    }

    res.json(reminder);
  })
);

remindersRouter.patch(
  '/:reminderId',
  asyncHandler(async (req, res) => {
    const { reminderId } = reminderIdSchema.parse(req.params);
    const payload = updateReminderSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const data: Prisma.ReminderUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.message !== undefined) data.message = payload.message ?? null;
    if (payload.targetType !== undefined) data.targetType = payload.targetType;
    if (payload.targetId !== undefined) data.targetId = payload.targetId ?? null;
    if (payload.channelMask !== undefined) data.channelMask = payload.channelMask;
    if (payload.leadTimeMinutes !== undefined) data.leadTimeMinutes = payload.leadTimeMinutes;
    if (payload.quietHoursStart !== undefined) data.quietHoursStart = payload.quietHoursStart ?? null;
    if (payload.quietHoursEnd !== undefined) data.quietHoursEnd = payload.quietHoursEnd ?? null;
    if (payload.enabled !== undefined) data.enabled = payload.enabled;

    try {
      const reminder = await prisma.reminder.update({
        where: { id: reminderId },
        data,
        include: { owner: { select: ownerSelect } },
      });
      res.json(reminder);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'REMINDER_NOT_FOUND', message: 'Reminder not found' } });
      }
      throw err;
    }
  })
);

remindersRouter.delete(
  '/:reminderId',
  asyncHandler(async (req, res) => {
    const { reminderId } = reminderIdSchema.parse(req.params);

    try {
      await prisma.reminder.delete({ where: { id: reminderId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'REMINDER_NOT_FOUND', message: 'Reminder not found' } });
      }
      throw err;
    }
  })
);
