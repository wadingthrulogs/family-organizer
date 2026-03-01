import type { OAuth2Client } from 'google-auth-library';
import type { LinkedCalendar } from '@prisma/client';
import { calendar_v3 } from 'googleapis';

import { calendarApi } from '../lib/google.js';
import { logger } from '../lib/logger.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { prisma } from '../lib/prisma.js';

const SECRET_TYPE = 'GOOGLE_CALENDAR_REFRESH_TOKEN';

/* ─── GoogleAccount-based functions (NEW) ─── */

export async function upsertGoogleAccount(userId: number, email: string, refreshToken: string, displayName?: string | null) {
  return prisma.googleAccount.upsert({
    where: { userId_email: { userId, email } },
    update: {
      encryptedRefreshToken: encryptSecret(refreshToken),
      ...(displayName ? { displayName } : {}),
    },
    create: {
      userId,
      email,
      encryptedRefreshToken: encryptSecret(refreshToken),
      displayName: displayName ?? null,
    },
  });
}

export async function getGoogleAccounts(userId: number) {
  return prisma.googleAccount.findMany({
    where: { userId },
    include: {
      linkedCalendars: {
        orderBy: { displayName: 'asc' },
      },
    },
  });
}

export async function getGoogleAccountById(accountId: number) {
  return prisma.googleAccount.findUnique({
    where: { id: accountId },
    include: { linkedCalendars: { orderBy: { displayName: 'asc' } } },
  });
}

export function decryptAccountRefreshToken(encryptedToken: Buffer) {
  try {
    return decryptSecret(encryptedToken);
  } catch (error) {
    logger.error('Failed to decrypt Google refresh token', { error });
    return null;
  }
}

export async function removeGoogleAccount(accountId: number) {
  const account = await prisma.googleAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  // Revoke token with Google
  const refreshToken = decryptAccountRefreshToken(account.encryptedRefreshToken);
  if (refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (error) {
      logger.warn('Google failed to revoke OAuth token for account', { accountId, error });
    }
  }

  // Soft-delete events and remove calendars linked to this account
  const calendars = await prisma.linkedCalendar.findMany({ where: { googleAccountId: accountId }, select: { id: true } });
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length > 0) {
    await prisma.familyEvent.updateMany({ where: { linkedCalendarId: { in: calendarIds } }, data: { deleted: true } });
    await prisma.linkedCalendar.deleteMany({ where: { id: { in: calendarIds } } });
  }

  await prisma.googleAccount.delete({ where: { id: accountId } });
}

export async function syncGoogleAccountCalendarList(accountId: number, userId: number, client: OAuth2Client) {
  const api = calendarApi(client);
  const seenGoogleIds = new Set<string>();
  const upserts: LinkedCalendar[] = [];
  let pageToken: string | undefined;

  do {
    const response = await api.calendarList.list({
      minAccessRole: 'reader',
      showHidden: false,
      pageToken,
    });

    for (const entry of response.data.items ?? []) {
      if (!entry.id) continue;
      seenGoogleIds.add(entry.id);
      const record = await prisma.linkedCalendar.upsert({
        where: { userId_googleId: { userId, googleId: entry.id } },
        update: {
          googleAccountId: accountId,
          displayName: entry.summary || entry.id,
          colorHex: entry.backgroundColor || null,
          accessRole: entry.accessRole || 'reader',
        },
        create: {
          userId,
          googleAccountId: accountId,
          googleId: entry.id,
          displayName: entry.summary || entry.id,
          colorHex: entry.backgroundColor || null,
          accessRole: entry.accessRole || 'reader',
        },
      });
      upserts.push(record);
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Prune calendars that are no longer in this account
  const retainedGoogleIds = Array.from(seenGoogleIds);
  const calendarsToRemove = await prisma.linkedCalendar.findMany({
    where: {
      googleAccountId: accountId,
      ...(retainedGoogleIds.length > 0 ? { googleId: { notIn: retainedGoogleIds } } : {}),
    },
    select: { id: true },
  });

  if (calendarsToRemove.length > 0) {
    const ids = calendarsToRemove.map((c) => c.id);
    await prisma.familyEvent.updateMany({ where: { linkedCalendarId: { in: ids } }, data: { deleted: true } });
    await prisma.linkedCalendar.deleteMany({ where: { id: { in: ids } } });
  }

  return upserts;
}

export async function syncGoogleAccountEvents(accountId: number, client: OAuth2Client) {
  const calendars = await prisma.linkedCalendar.findMany({ where: { googleAccountId: accountId } });
  if (calendars.length === 0) return;

  const api = calendarApi(client);
  for (const calendar of calendars) {
    await syncCalendarEvents(api, calendar);
  }

  await prisma.googleAccount.update({
    where: { id: accountId },
    data: { lastSyncedAt: new Date() },
  });
}

export async function getAllGoogleAccounts() {
  return prisma.googleAccount.findMany({ select: { id: true, userId: true, encryptedRefreshToken: true } });
}

/* ─── Legacy wrappers (kept for backward compat) ─── */

export async function storeGoogleRefreshToken(userId: number, refreshToken: string) {
  await prisma.userSecret.upsert({
    where: { userId_secretType: { userId, secretType: SECRET_TYPE } },
    update: { encryptedValue: encryptSecret(refreshToken) },
    create: { userId, secretType: SECRET_TYPE, encryptedValue: encryptSecret(refreshToken) },
  });
}

export async function getGoogleRefreshToken(userId: number) {
  const secret = await prisma.userSecret.findUnique({
    where: { userId_secretType: { userId, secretType: SECRET_TYPE } },
  });
  if (!secret) return null;
  try {
    return decryptSecret(secret.encryptedValue);
  } catch (error) {
    logger.error('Failed to decrypt Google refresh token', { error });
    return null;
  }
}

export async function removeGoogleIntegration(userId: number) {
  const refreshToken = await getGoogleRefreshToken(userId);
  if (refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (error) {
      logger.warn('Google failed to revoke OAuth token for user', { userId, error });
    }
  }

  const calendars = await prisma.linkedCalendar.findMany({ where: { userId }, select: { id: true } });
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length > 0) {
    await prisma.familyEvent.updateMany({ where: { linkedCalendarId: { in: calendarIds } }, data: { deleted: true } });
    await prisma.linkedCalendar.deleteMany({ where: { id: { in: calendarIds } } });
  }

  // Also remove all GoogleAccount rows for this user
  await prisma.googleAccount.deleteMany({ where: { userId } });
  await prisma.userSecret.deleteMany({ where: { userId, secretType: SECRET_TYPE } });
}

export async function listLinkedCalendars(userId: number) {
  return prisma.linkedCalendar.findMany({ where: { userId }, orderBy: { displayName: 'asc' } });
}

export async function syncGoogleCalendarList(userId: number, client: OAuth2Client) {
  const api = calendarApi(client);
  const seenGoogleIds = new Set<string>();
  const upserts: LinkedCalendar[] = [];
  let pageToken: string | undefined;

  do {
    const response = await api.calendarList.list({
      minAccessRole: 'reader',
      showHidden: false,
      pageToken,
    });

    for (const entry of response.data.items ?? []) {
      if (!entry.id) continue;
      seenGoogleIds.add(entry.id);
      const record = await prisma.linkedCalendar.upsert({
        where: { userId_googleId: { userId, googleId: entry.id } },
        update: {
          displayName: entry.summary || entry.id,
          colorHex: entry.backgroundColor || null,
          accessRole: entry.accessRole || 'reader',
        },
        create: {
          userId,
          googleId: entry.id,
          displayName: entry.summary || entry.id,
          colorHex: entry.backgroundColor || null,
          accessRole: entry.accessRole || 'reader',
        },
      });
      upserts.push(record);
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const retainedGoogleIds = Array.from(seenGoogleIds);
  const calendarsToRemove = await prisma.linkedCalendar.findMany({
    where: {
      userId,
      ...(retainedGoogleIds.length > 0 ? { googleId: { notIn: retainedGoogleIds } } : {}),
    },
    select: { id: true },
  });

  if (calendarsToRemove.length > 0) {
    const ids = calendarsToRemove.map((c) => c.id);
    await prisma.familyEvent.updateMany({ where: { linkedCalendarId: { in: ids } }, data: { deleted: true } });
    await prisma.linkedCalendar.deleteMany({ where: { id: { in: ids } } });
  }

  return upserts;
}

export async function syncGoogleEvents(userId: number, client: OAuth2Client) {
  const calendars = await prisma.linkedCalendar.findMany({ where: { userId } });
  if (calendars.length === 0) return;

  const api = calendarApi(client);
  for (const calendar of calendars) {
    await syncCalendarEvents(api, calendar);
  }
}

async function syncCalendarEvents(api: calendar_v3.Calendar, calendar: LinkedCalendar) {
  const lookbackMs = 1000 * 60 * 60 * 24 * 30;
  const timeMin = new Date(Date.now() - lookbackMs).toISOString();
  let pageToken: string | undefined;
  let syncToken = calendar.syncToken || undefined;
  let latestSyncToken: string | undefined;

  while (true) {
    try {
      const response = await api.events.list({
        calendarId: calendar.googleId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        ...(syncToken ? { syncToken } : { timeMin }),
      });

      for (const event of response.data.items ?? []) {
        await upsertFamilyEvent(calendar.id, event);
      }

      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken && response.data.nextSyncToken) {
        latestSyncToken = response.data.nextSyncToken;
      }

      if (!pageToken) {
        break;
      }
    } catch (error) {
      if (isSyncTokenExpired(error)) {
        syncToken = undefined;
        pageToken = undefined;
        continue;
      }
      throw error;
    }
  }

  await prisma.linkedCalendar.update({
    where: { id: calendar.id },
    data: {
      lastSyncedAt: new Date(),
      ...(latestSyncToken ? { syncToken: latestSyncToken } : {}),
    },
  });
}

function isSyncTokenExpired(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const maybeCode = (error as { code?: number }).code;
  return maybeCode === 410;
}

async function upsertFamilyEvent(linkedCalendarId: number, event: calendar_v3.Schema$Event) {
  if (!event.id) {
    return;
  }

  const existing = await prisma.familyEvent.findFirst({
    where: { linkedCalendarId, sourceEventId: event.id },
  });

  if (event.status === 'cancelled') {
    if (existing) {
      await prisma.familyEvent.update({ where: { id: existing.id }, data: { deleted: true } });
    }
    return;
  }

  const timing = normalizeEventTiming(event);
  if (!timing) {
    return;
  }

  const attendees = event.attendees?.map((attendee) => ({
    name: attendee.displayName ?? undefined,
    email: attendee.email ?? undefined,
    responseStatus: attendee.responseStatus ?? undefined,
  }));
  const attendeesJson = attendees && attendees.length > 0 ? JSON.stringify(attendees) : null;

  const payload = {
    title: event.summary || 'Untitled event',
    description: event.description || null,
    startAt: timing.startAt,
    endAt: timing.endAt,
    allDay: timing.allDay,
    timezone: timing.timezone,
    colorHex: event.colorId ? mapColorIdToHex(event.colorId) : null,
    location: event.location || null,
    visibility: event.visibility || null,
    attendees: attendeesJson,
    etag: event.etag || null,
    deleted: false,
  } as const;

  if (existing) {
    await prisma.familyEvent.update({ where: { id: existing.id }, data: payload });
  } else {
    await prisma.familyEvent.create({
      data: {
        linkedCalendarId,
        source: 'GOOGLE',
        sourceEventId: event.id,
        ...payload,
      },
    });
  }
}

function normalizeEventTiming(event: calendar_v3.Schema$Event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) {
    return null;
  }

  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const startAt = parseGoogleDate(start, allDay, true);
  const endAt = parseGoogleDate(end, allDay, false);
  const timezone = event.start?.timeZone || event.end?.timeZone || 'UTC';

  return { startAt, endAt, allDay, timezone };
}

function parseGoogleDate(value: string, allDay: boolean, isStart: boolean) {
  if (!allDay) {
    return new Date(value);
  }
  const suffix = isStart ? 'T00:00:00.000Z' : 'T23:59:59.000Z';
  return new Date(`${value}${value.includes('T') ? '' : suffix}`);
}

function mapColorIdToHex(_colorId: string) {
  return null;
}
