import webpush from 'web-push';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { isMailerReady, sendMail } from '../lib/mailer.js';

import { runBackgroundCalendarSync } from './background-sync.js';
import { runTaskRetention } from './task-retention.js';

/* ─── Channel bit flags (must match frontend CHANNEL_FLAGS) ─── */
const CH = { PUSH: 1, EMAIL: 2, WEBHOOK: 4 } as const;

/* ─── Webhook config ─── */
let webhookUrl: string | null = null;
export function setWebhookUrl(url?: string) {
  webhookUrl = url ?? null;
  if (webhookUrl) {
    logger.info('Webhook delivery configured', { url: webhookUrl });
  }
}

/* ─── Types ─── */
interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}

/* ─── VAPID setup ─── */
let vapidConfigured = false;

export function initVapid(publicKey?: string, privateKey?: string) {
  if (publicKey && privateKey) {
    webpush.setVapidDetails('mailto:admin@family-organizer.local', publicKey, privateKey);
    vapidConfigured = true;
    logger.info('VAPID keys configured for push notifications');
  } else {
    logger.warn('VAPID keys not set – browser push notifications disabled');
  }
}

/* ─── Quiet hours check ─── */
function isInQuietHours(
  quietStart: string | null | undefined,
  quietEnd: string | null | undefined,
  timezone: string
): boolean {
  if (!quietStart || !quietEnd) return false;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const nowMinutes = hour * 60 + minute;

    const [startH, startM] = quietStart.split(':').map(Number);
    const [endH, endM] = quietEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // e.g. 21:30 - 23:00 (same day)
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    } else {
      // e.g. 21:30 - 06:30 (overnight)
      return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}

/* ─── Send push notification to a single user ─── */
async function sendPushToUser(userId: number, payload: NotificationPayload): Promise<number> {
  if (!vapidConfigured) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 3600 }
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      // 404/410 means subscription is expired – clean it up
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        logger.info('Removed expired push subscription', { subId: sub.id, userId });
      } else {
        logger.error('Push send failed', { userId, endpoint: sub.endpoint, error: String(err) });
      }
    }
  }
  return sent;
}

/* ─── Log a notification ─── */
async function logNotification(
  userId: number,
  reminderId: number | null,
  channel: string,
  title: string,
  body: string | null,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  errorDetail?: string
) {
  await prisma.notificationLog.create({
    data: {
      userId,
      reminderId,
      channel,
      title,
      body,
      status,
      errorDetail: errorDetail ?? null,
      sentAt: status === 'SENT' ? new Date() : null,
    },
  });
}

/* ─── Process due triggers ─── */
export async function processDueTriggers(): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const now = new Date();
  const stats = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  // Find all triggers that are due
  const dueTriggers = await prisma.reminderTrigger.findMany({
    where: {
      nextFireAt: { lte: now },
    },
    include: {
      reminder: {
        include: {
          owner: { select: { id: true, username: true, timezone: true } },
        },
      },
    },
    orderBy: { nextFireAt: 'asc' },
    take: 100, // process in batches
  });

  for (const trigger of dueTriggers) {
    stats.processed++;
    const { reminder } = trigger;

    // Skip if reminder disabled
    if (!reminder.enabled) {
      await prisma.reminderTrigger.update({
        where: { id: trigger.id },
        data: {
          lastAttemptAt: now,
          lastStatus: 'SKIPPED_DISABLED',
        },
      });
      stats.skipped++;
      continue;
    }

    const userTz = reminder.owner?.timezone ?? 'UTC';

    // Check quiet hours (use reminder-level quiet hours, fall back to global)
    if (isInQuietHours(reminder.quietHoursStart, reminder.quietHoursEnd, userTz)) {
      // Defer by 30 minutes and re-check
      await prisma.reminderTrigger.update({
        where: { id: trigger.id },
        data: {
          nextFireAt: new Date(now.getTime() + 30 * 60 * 1000),
          lastAttemptAt: now,
          lastStatus: 'DEFERRED_QUIET',
        },
      });
      stats.skipped++;
      continue;
    }

    const payload: NotificationPayload = {
      title: reminder.title,
      body: reminder.message ?? '',
      tag: `reminder-${reminder.id}`,
      url: '/',
    };

    const channel = trigger.channel.toUpperCase();

    try {
      if (channel === 'PUSH') {
        const count = await sendPushToUser(reminder.ownerUserId, payload);
        if (count > 0) {
          await logNotification(reminder.ownerUserId, reminder.id, 'PUSH', payload.title, payload.body, 'SENT');
          stats.sent++;
        } else {
          await logNotification(reminder.ownerUserId, reminder.id, 'PUSH', payload.title, payload.body, 'SKIPPED', 'No active subscriptions');
          stats.skipped++;
        }
      } else if (channel === 'EMAIL') {
        // Send email via SMTP if configured
        if (isMailerReady()) {
          // Look up user email
          const user = await prisma.user.findUnique({ where: { id: reminder.ownerUserId }, select: { email: true } });
          if (user?.email) {
            await sendMail(user.email, payload.title, payload.body ?? '');
            await logNotification(reminder.ownerUserId, reminder.id, 'EMAIL', payload.title, payload.body, 'SENT');
            stats.sent++;
          } else {
            await logNotification(reminder.ownerUserId, reminder.id, 'EMAIL', payload.title, payload.body, 'SKIPPED', 'User has no email address');
            stats.skipped++;
          }
        } else {
          await logNotification(reminder.ownerUserId, reminder.id, 'EMAIL', payload.title, payload.body, 'SKIPPED', 'SMTP not configured');
          stats.skipped++;
        }
      } else if (channel === 'WEBHOOK') {
        // Send webhook/Gotify notification via HTTP POST
        if (webhookUrl) {
          const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: payload.title, message: payload.body, url: payload.url, tag: payload.tag }),
          });
          if (res.ok) {
            await logNotification(reminder.ownerUserId, reminder.id, 'WEBHOOK', payload.title, payload.body, 'SENT');
            stats.sent++;
          } else {
            throw new Error(`Webhook returned ${res.status}: ${await res.text().catch(() => '')}`);
          }
        } else {
          await logNotification(reminder.ownerUserId, reminder.id, 'WEBHOOK', payload.title, payload.body, 'SKIPPED', 'Webhook URL not configured');
          stats.skipped++;
        }
      }

      // Mark trigger as processed and remove it (one-shot) or reschedule
      await prisma.reminderTrigger.update({
        where: { id: trigger.id },
        data: {
          lastAttemptAt: now,
          lastStatus: 'SENT',
          // Move nextFireAt far into future to mark as done (one-shot triggers)
          nextFireAt: new Date('2099-12-31T23:59:59Z'),
        },
      });
    } catch (err) {
      await logNotification(
        reminder.ownerUserId,
        reminder.id,
        channel,
        payload.title,
        payload.body,
        'FAILED',
        String(err)
      );
      // Increment retry count
      await prisma.reminderTrigger.update({
        where: { id: trigger.id },
        data: {
          lastAttemptAt: now,
          lastStatus: 'FAILED',
          retryCount: { increment: 1 },
          // Retry in 5 minutes (back off)
          nextFireAt: new Date(now.getTime() + 5 * 60 * 1000 * (trigger.retryCount + 1)),
        },
      });
      stats.failed++;
    }
  }

  return stats;
}

/* ─── Generate triggers from reminders ─── */
export async function generateTriggersForReminder(reminderId: number): Promise<number> {
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder || !reminder.enabled) return 0;

  const channelMask = reminder.channelMask;
  const channels: string[] = [];
  if (channelMask & CH.PUSH) channels.push('PUSH');
  if (channelMask & CH.EMAIL) channels.push('EMAIL');
  if (channelMask & CH.WEBHOOK) channels.push('WEBHOOK');

  if (channels.length === 0) return 0;

  // Compute fire time: now + leadTimeMinutes offset (if set)
  const fireAt = new Date();
  // Lead time already factored in at reminder creation – fire now
  let created = 0;

  for (const channel of channels) {
    // Check if a pending trigger already exists
    const existing = await prisma.reminderTrigger.findFirst({
      where: {
        reminderId,
        channel,
        nextFireAt: { lt: new Date('2099-01-01') },
      },
    });

    if (!existing) {
      await prisma.reminderTrigger.create({
        data: {
          reminderId,
          channel,
          nextFireAt: fireAt,
        },
      });
      created++;
    }
  }

  return created;
}

/* ─── Generate triggers for ALL enabled reminders ─── */
export async function generateAllPendingTriggers(): Promise<number> {
  const reminders = await prisma.reminder.findMany({
    where: { enabled: true },
    select: { id: true },
  });

  let total = 0;
  for (const r of reminders) {
    total += await generateTriggersForReminder(r.id);
  }
  return total;
}

/* ─── Escalation: check for overdue tasks assigned to viewers/members ─── */
export async function checkEscalations(): Promise<number> {
  const now = new Date();
  let escalated = 0;

  // Find overdue tasks with assignments to non-admin users
  const overdueAssignments = await prisma.taskAssignment.findMany({
    where: {
      status: 'OPEN',
      task: {
        dueAt: { lt: now },
        status: { not: 'DONE' },
        deletedAt: null,
      },
    },
    include: {
      task: { select: { id: true, title: true, dueAt: true } },
      user: { select: { id: true, username: true, role: true } },
    },
    take: 50,
  });

  if (overdueAssignments.length === 0) return 0;

  // Find admin users to escalate to
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', deletedAt: null },
    select: { id: true, username: true },
  });

  for (const assignment of overdueAssignments) {
    if (assignment.user.role === 'ADMIN') continue; // skip admin's own tasks

    for (const admin of admins) {
      // Check if we already notified this admin about this task today
      const alreadyNotified = await prisma.notificationLog.findFirst({
        where: {
          userId: admin.id,
          title: { contains: `Overdue: ${assignment.task.title}` },
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (alreadyNotified) continue;

      const payload: NotificationPayload = {
        title: `Overdue: ${assignment.task.title}`,
        body: `${assignment.user.username}'s task is past due (was due ${assignment.task.dueAt?.toLocaleDateString() ?? 'unknown'})`,
        tag: `escalation-task-${assignment.task.id}`,
        url: '/tasks',
      };

      const pushCount = await sendPushToUser(admin.id, payload);
      await logNotification(
        admin.id,
        null,
        'PUSH',
        payload.title,
        payload.body,
        pushCount > 0 ? 'SENT' : 'SKIPPED',
        pushCount === 0 ? 'No push subscriptions for admin' : undefined
      );
      escalated++;
    }
  }

  // Also check overdue chores
  const overdueChores = await prisma.choreAssignment.findMany({
    where: {
      state: 'PENDING',
      windowEnd: { lt: now },
    },
    include: {
      chore: { select: { id: true, title: true } },
      assignee: { select: { id: true, username: true, role: true } },
    },
    take: 50,
  });

  for (const ca of overdueChores) {
    if (!ca.assignee || ca.assignee.role === 'ADMIN') continue;

    for (const admin of admins) {
      const alreadyNotified = await prisma.notificationLog.findFirst({
        where: {
          userId: admin.id,
          title: { contains: `Overdue chore: ${ca.chore.title}` },
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (alreadyNotified) continue;

      const payload: NotificationPayload = {
        title: `Overdue chore: ${ca.chore.title}`,
        body: `${ca.assignee.username} hasn't completed this chore (window ended ${ca.windowEnd.toLocaleDateString()})`,
        tag: `escalation-chore-${ca.chore.id}`,
        url: '/chores',
      };

      const pushCount = await sendPushToUser(admin.id, payload);
      await logNotification(
        admin.id,
        null,
        'PUSH',
        payload.title,
        payload.body,
        pushCount > 0 ? 'SENT' : 'SKIPPED',
        pushCount === 0 ? 'No push subscriptions for admin' : undefined
      );
      escalated++;
    }
  }

  return escalated;
}

/* ─── Digest: send daily summary to each user ─── */
export async function sendDigestNotifications(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, timezone: true },
  });

  let sent = 0;

  for (const user of users) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Count today's tasks
    const tasksDue = await prisma.taskAssignment.count({
      where: {
        userId: user.id,
        status: 'OPEN',
        task: { dueAt: { gte: todayStart, lte: todayEnd }, deletedAt: null },
      },
    });

    // Count pending chores
    const choresPending = await prisma.choreAssignment.count({
      where: {
        userId: user.id,
        state: 'PENDING',
        windowEnd: { gte: todayStart },
      },
    });

    // Count active grocery items
    const groceryNeeded = await prisma.groceryItem.count({
      where: {
        assigneeUserId: user.id,
        state: 'NEEDED',
      },
    });

    if (tasksDue === 0 && choresPending === 0 && groceryNeeded === 0) continue;

    const parts: string[] = [];
    if (tasksDue > 0) parts.push(`${tasksDue} task${tasksDue > 1 ? 's' : ''} due`);
    if (choresPending > 0) parts.push(`${choresPending} chore${choresPending > 1 ? 's' : ''} pending`);
    if (groceryNeeded > 0) parts.push(`${groceryNeeded} grocery item${groceryNeeded > 1 ? 's' : ''} needed`);

    const payload: NotificationPayload = {
      title: 'Daily Summary',
      body: parts.join(', '),
      tag: `digest-${now.toISOString().slice(0, 10)}`,
      url: '/',
    };

    const pushCount = await sendPushToUser(user.id, payload);
    await logNotification(
      user.id,
      null,
      'PUSH',
      payload.title,
      payload.body,
      pushCount > 0 ? 'SENT' : 'SKIPPED',
      pushCount === 0 ? 'No push subscriptions' : undefined
    );
    if (pushCount > 0) sent++;
  }

  return sent;
}

/* ─── Ticker: runs all periodic jobs ─── */
let tickerInterval: ReturnType<typeof setInterval> | null = null;
let digestLastRun = '';
let retentionLastRun = '';

export function startNotificationTicker(intervalMs = 60_000) {
  if (tickerInterval) return;

  logger.info('Notification engine started', { intervalMs });

  tickerInterval = setInterval(async () => {
    try {
      // 1. Process due triggers
      const triggerStats = await processDueTriggers();
      if (triggerStats.processed > 0) {
        logger.info('Processed notification triggers', triggerStats);
      }

      // 2. Check escalations every 15 minutes (check minute marker)
      const minute = new Date().getMinutes();
      if (minute % 15 === 0) {
        const escalated = await checkEscalations();
        if (escalated > 0) {
          logger.info('Escalation notifications sent', { escalated });
        }
      }

      // 3. Background Google Calendar sync every 30 minutes
      if (minute % 30 === 0) {
        const synced = await runBackgroundCalendarSync();
        if (synced > 0) {
          logger.info('Background calendar sync completed', { synced });
        }
      }

      // 4. Daily digest at ~8:00 AM (check once per day)
      const today = new Date().toISOString().slice(0, 10);
      const hour = new Date().getHours();
      if (hour >= 8 && digestLastRun !== today) {
        digestLastRun = today;
        const digestCount = await sendDigestNotifications();
        logger.info('Daily digest sent', { digestCount });
      }

      // 5. Daily task retention sweep at 3 AM (idempotent by day).
      // Runs in a quiet window so the UI never shows a row vanishing during use.
      if (hour === 3 && retentionLastRun !== today) {
        retentionLastRun = today;
        runTaskRetention()
          .then((r) => logger.info('Task retention completed', { ...r }))
          .catch((err) => logger.error('Task retention failed', { err: String(err) }));
      }
    } catch (err) {
      logger.error('Notification ticker error', { error: String(err) });
    }
  }, intervalMs);
}

export function stopNotificationTicker() {
  if (tickerInterval) {
    clearInterval(tickerInterval);
    tickerInterval = null;
    logger.info('Notification engine stopped');
  }
}
