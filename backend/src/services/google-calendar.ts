import type { OAuth2Client } from 'google-auth-library';
import type { LinkedCalendar, Prisma } from '@prisma/client';
import { calendar_v3 } from 'googleapis';

import { calendarApi } from '../lib/google.js';
import { logger } from '../lib/logger.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { prisma } from '../lib/prisma.js';

const SECRET_TYPE = 'GOOGLE_CALENDAR_REFRESH_TOKEN';

const EVENT_CHUNK_SIZE = 100;
const TRANSACTION_TIMEOUT_MS = 30_000;
const UNRECOVERABLE_AUTH_ERRORS = ['invalid_grant', 'insufficient_scope', 'Insufficient Permission', 'PERMISSION_DENIED'];
const AUTH_ERROR_COOLDOWN_MS = 24 * 60 * 60 * 1000;

let syncInFlight = false;

export function isSyncInFlight() {
  return syncInFlight;
}

export async function withSyncLock<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; reason: 'busy' }> {
  if (syncInFlight) {
    logger.info('Sync skipped — another sync in progress', { label });
    return { ok: false, reason: 'busy' };
  }
  syncInFlight = true;
  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    syncInFlight = false;
  }
}

export function isUnrecoverableAuthError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return UNRECOVERABLE_AUTH_ERRORS.some((needle) => errorMessage.includes(needle));
}

export function isAccountInAuthCooldown(account: { lastSyncError: string | null; lastSyncErrorAt: Date | null }): boolean {
  if (!isUnrecoverableAuthError(account.lastSyncError)) return false;
  if (!account.lastSyncErrorAt) return false;
  return Date.now() - account.lastSyncErrorAt.getTime() < AUTH_ERROR_COOLDOWN_MS;
}

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
    data: { lastSyncedAt: new Date(), lastSyncError: null, lastSyncErrorAt: null },
  });
}

export async function getAllGoogleAccounts() {
  return prisma.googleAccount.findMany({ select: { id: true, userId: true, encryptedRefreshToken: true } });
}

export function classifyGoogleSyncError(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { error?: string | { code?: number; message?: string; status?: string } } };
    message?: string;
    code?: number;
    status?: number;
  };
  const apiError = e?.response?.data?.error;
  if (typeof apiError === 'string') return apiError;
  if (apiError && typeof apiError === 'object') {
    const msg = apiError.message ? String(apiError.message) : '';
    const status = apiError.status ? String(apiError.status) : '';
    if (status === 'PERMISSION_DENIED') return msg || 'PERMISSION_DENIED';
    if (msg) return msg;
  }
  if (typeof e?.message === 'string') {
    if (e.message.includes('invalid_grant')) return 'invalid_grant';
    if (e.message.includes('insufficient')) return 'insufficient_scope';
    return e.message.slice(0, 200);
  }
  return 'unknown_error';
}

export async function markAccountSyncError(accountId: number, err: unknown) {
  const code = classifyGoogleSyncError(err);
  await prisma.googleAccount.update({
    where: { id: accountId },
    data: { lastSyncError: code, lastSyncErrorAt: new Date() },
  }).catch((e) => logger.warn('Failed to record account sync error', { accountId, e }));
}

export async function clearAccountSyncError(accountId: number) {
  await prisma.googleAccount.update({
    where: { id: accountId },
    data: { lastSyncError: null, lastSyncErrorAt: null },
  }).catch((e) => logger.warn('Failed to clear account sync error', { accountId, e }));
}

export async function clearSyncTokensForAccount(accountId: number) {
  await prisma.linkedCalendar.updateMany({
    where: { googleAccountId: accountId },
    data: { syncToken: null },
  });
}

/**
 * Hard-deletes orphan FamilyEvents that were soft-deleted when their LinkedCalendar was removed.
 * These rows are inert (deleted=true, linkedCalendarId=null) but accumulate over time as the user
 * disconnects and reconnects Google accounts. Runs once on backend startup; idempotent.
 */
export async function cleanupOrphanEvents(): Promise<number> {
  const result = await prisma.familyEvent.deleteMany({
    where: { linkedCalendarId: null, deleted: true, source: 'GOOGLE' },
  });
  if (result.count > 0) {
    logger.info('Cleaned up orphan FamilyEvent rows', { count: result.count });
  }
  return result.count;
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

async function syncCalendarEvents(api: calendar_v3.Calendar, calendar: LinkedCalendar, forceFullSync = false) {
  const lookbackMs = 1000 * 60 * 60 * 24 * 30;
  const timeMinDate = new Date(Date.now() - lookbackMs);
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  const useIncremental = !forceFullSync && Boolean(calendar.syncToken);
  const baseParams: calendar_v3.Params$Resource$Events$List = useIncremental
    ? {
        calendarId: calendar.googleId,
        syncToken: calendar.syncToken!,
        showDeleted: true,
      }
    : {
        calendarId: calendar.googleId,
        timeMin: timeMinDate.toISOString(),
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
      };

  const seenSourceIds = new Set<string>();
  let processed = 0;
  let cancelled = 0;

  try {
    while (true) {
      const response = await api.events.list({ ...baseParams, pageToken });
      const pageEvents = response.data.items ?? [];

      const result = await processEventPage(calendar.id, pageEvents);
      for (const id of result.seen) seenSourceIds.add(id);
      processed += result.processed;
      cancelled += result.cancelled;

      pageToken = response.data.nextPageToken ?? undefined;
      if (!pageToken) {
        nextSyncToken = response.data.nextSyncToken ?? undefined;
        break;
      }
    }
  } catch (err: unknown) {
    const status =
      (err as { code?: number }).code ??
      (err as { response?: { status?: number } }).response?.status;
    if (useIncremental && status === 410) {
      logger.warn('Google syncToken expired, retrying with full sync now', { calendarId: calendar.id });
      await prisma.linkedCalendar.update({
        where: { id: calendar.id },
        data: { syncToken: null },
      });
      await syncCalendarEvents(api, calendar, true);
      return;
    }
    throw err;
  }

  let pruned = 0;
  if (!useIncremental && seenSourceIds.size > 0) {
    const result = await prisma.familyEvent.updateMany({
      where: {
        linkedCalendarId: calendar.id,
        source: 'GOOGLE',
        deleted: false,
        startAt: { gte: timeMinDate },
        sourceEventId: { notIn: Array.from(seenSourceIds) },
      },
      data: { deleted: true },
    });
    pruned = result.count;
  }

  await prisma.linkedCalendar.update({
    where: { id: calendar.id },
    data: {
      lastSyncedAt: new Date(),
      ...(nextSyncToken ? { syncToken: nextSyncToken } : {}),
    },
  });

  logger.info('Calendar sync complete', {
    calendarId: calendar.id,
    mode: useIncremental ? 'incremental' : 'full',
    processed,
    cancelled,
    pruned,
  });
}

interface ProcessPageResult {
  seen: string[];
  processed: number;
  cancelled: number;
}

async function processEventPage(linkedCalendarId: number, events: calendar_v3.Schema$Event[]): Promise<ProcessPageResult> {
  const result: ProcessPageResult = { seen: [], processed: 0, cancelled: 0 };
  if (events.length === 0) return result;

  const sourceIds: string[] = [];
  for (const event of events) {
    if (event.id) {
      sourceIds.push(event.id);
      result.seen.push(event.id);
    }
  }

  const existingRows = sourceIds.length > 0
    ? await prisma.familyEvent.findMany({
        where: { linkedCalendarId, sourceEventId: { in: sourceIds } },
        select: { id: true, sourceEventId: true },
      })
    : [];
  const existingByEventId = new Map<string, number>();
  for (const row of existingRows) {
    if (row.sourceEventId) existingByEventId.set(row.sourceEventId, row.id);
  }

  for (let i = 0; i < events.length; i += EVENT_CHUNK_SIZE) {
    const chunk = events.slice(i, i + EVENT_CHUNK_SIZE);
    await prisma.$transaction(async (tx) => {
      for (const event of chunk) {
        if (!event.id) continue;
        const existingId = existingByEventId.get(event.id);
        const wasCancelled = await processEvent(tx, linkedCalendarId, event, existingId, existingByEventId);
        if (wasCancelled === 'cancelled') result.cancelled += 1;
        if (wasCancelled !== 'skipped') result.processed += 1;
      }
    }, { timeout: TRANSACTION_TIMEOUT_MS });
  }

  return result;
}

async function processEvent(
  tx: Prisma.TransactionClient,
  linkedCalendarId: number,
  event: calendar_v3.Schema$Event,
  existingId: number | undefined,
  existingByEventId: Map<string, number>,
): Promise<'cancelled' | 'upserted' | 'skipped'> {
  if (event.status === 'cancelled') {
    if (existingId) {
      await tx.familyEvent.update({ where: { id: existingId }, data: { deleted: true } });
    }
    return 'cancelled';
  }

  const timing = normalizeEventTiming(event);
  if (!timing) return 'skipped';

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

  if (existingId) {
    await tx.familyEvent.update({ where: { id: existingId }, data: payload });
  } else {
    const created = await tx.familyEvent.create({
      data: {
        linkedCalendarId,
        source: 'GOOGLE',
        sourceEventId: event.id!,
        ...payload,
      },
      select: { id: true },
    });
    if (event.id) existingByEventId.set(event.id, created.id);
  }
  return 'upserted';
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
