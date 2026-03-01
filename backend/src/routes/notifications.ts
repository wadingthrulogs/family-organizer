import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  processDueTriggers,
  generateTriggersForReminder,
  generateAllPendingTriggers,
  checkEscalations,
  sendDigestNotifications,
} from '../services/notification-engine.js';

export const notificationsRouter = Router();

/* ─── Schemas ─── */

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/* ─── POST /subscribe  — register a push subscription ─── */

notificationsRouter.post(
  '/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = subscribeSchema.parse(req.body ?? {});
    const userId = req.session.userId!;

    // Upsert by endpoint (one endpoint = one device)
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: payload.endpoint },
    });

    if (existing) {
      const updated = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId,
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });
      return res.json({ id: updated.id, message: 'Subscription updated' });
    }

    const sub = await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    res.status(201).json({ id: sub.id, message: 'Subscribed' });
  })
);

/* ─── DELETE /subscribe  — unsubscribe ─── */

notificationsRouter.delete(
  '/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body ?? {});

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.session.userId! },
    });

    res.json({ message: 'Unsubscribed' });
  })
);

/* ─── GET /subscriptions  — list current user's push subscriptions ─── */

notificationsRouter.get(
  '/subscriptions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: req.session.userId! },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items: subs, total: subs.length });
  })
);

/* ─── GET /log  — notification history for current user ─── */

notificationsRouter.get(
  '/log',
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const userId = req.session.userId!;

    const items = await prisma.notificationLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        channel: true,
        title: true,
        body: true,
        status: true,
        sentAt: true,
        createdAt: true,
        reminder: { select: { id: true, title: true } },
      },
    });

    const total = await prisma.notificationLog.count({ where: { userId } });

    res.json({ items, total });
  })
);

/* ─── GET /log/all  — admin: all notification logs ─── */

notificationsRouter.get(
  '/log/all',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const items = await prisma.notificationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        reminder: { select: { id: true, title: true } },
      },
    });

    const total = await prisma.notificationLog.count();

    res.json({ items, total });
  })
);

/* ─── POST /trigger/:reminderId  — manually fire a reminder now ─── */

notificationsRouter.post(
  '/trigger/:reminderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reminderId = Number(req.params.reminderId);
    if (Number.isNaN(reminderId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid reminder ID' } });
    }

    const created = await generateTriggersForReminder(reminderId);
    const stats = await processDueTriggers();

    res.json({ message: 'Trigger processed', triggersCreated: created, ...stats });
  })
);

/* ─── POST /process  — admin: manually run the notification cycle ─── */

notificationsRouter.post(
  '/process',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const generated = await generateAllPendingTriggers();
    const stats = await processDueTriggers();
    const escalated = await checkEscalations();

    res.json({
      message: 'Notification cycle complete',
      triggersGenerated: generated,
      ...stats,
      escalated,
    });
  })
);

/* ─── POST /digest  — admin: manually send daily digest ─── */

notificationsRouter.post(
  '/digest',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const sent = await sendDigestNotifications();
    res.json({ message: 'Digest sent', sent });
  })
);

/* ─── GET /vapid-public-key  — return VAPID public key for frontend ─── */

notificationsRouter.get(
  '/vapid-public-key',
  asyncHandler(async (_req, res) => {
    const key = process.env.PUSH_VAPID_PUBLIC_KEY ?? '';
    res.json({ publicKey: key });
  })
);
