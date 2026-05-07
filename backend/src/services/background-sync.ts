import { logger } from '../lib/logger.js';
import { createGoogleOAuthClient, resolveGoogleCredentials } from '../lib/google.js';
import { prisma } from '../lib/prisma.js';
import {
  decryptAccountRefreshToken,
  syncGoogleAccountCalendarList,
  syncGoogleAccountEvents,
  markAccountSyncError,
  isAccountInAuthCooldown,
  withSyncLock,
} from './google-calendar.js';
import type { AppEnv } from '../config/env.js';

let storedEnv: AppEnv | null = null;
let lastForcedFullSyncDate: string | null = null;

export function initBackgroundSync(env: AppEnv) {
  storedEnv = env;
}

/**
 * Sync all connected Google Calendar accounts.
 * Called from the notification engine ticker every 30 minutes.
 *
 * Stability rules:
 *  - Wrapped in withSyncLock; if another sync (manual or background) is in flight, this tick skips.
 *  - Accounts whose lastSyncError is an unrecoverable auth failure (invalid_grant, insufficient_scope,
 *    Insufficient Permission) are skipped for 24 hours after the error to avoid wasting Google API
 *    quota on a known-broken account.
 *  - Once per day after 4 AM (UTC), clears every syncToken so the next pass becomes a drift-correcting
 *    full sync. Combined with the prune-missing logic in syncCalendarEvents, this catches deletions
 *    that incremental sync missed.
 */
export async function runBackgroundCalendarSync(): Promise<number> {
  if (!storedEnv) return 0;

  const creds = await resolveGoogleCredentials(storedEnv);
  if (!creds) return 0;

  const result = await withSyncLock('background-sync', async () => {
    const accounts = await prisma.googleAccount.findMany({
      select: {
        id: true,
        userId: true,
        encryptedRefreshToken: true,
        lastSyncError: true,
        lastSyncErrorAt: true,
      },
    });
    if (!accounts.length) return 0;

    const today = new Date().toDateString();
    const hour = new Date().getHours();
    if (hour >= 4 && lastForcedFullSyncDate !== today) {
      logger.info('Forcing daily full sync (drift correction)');
      await prisma.linkedCalendar.updateMany({ data: { syncToken: null } });
      lastForcedFullSyncDate = today;
    }

    let synced = 0;
    for (const account of accounts) {
      if (isAccountInAuthCooldown(account)) {
        logger.info('Skipping account in auth-error cooldown', {
          accountId: account.id,
          lastSyncError: account.lastSyncError,
          lastSyncErrorAt: account.lastSyncErrorAt,
        });
        continue;
      }

      try {
        const refreshToken = decryptAccountRefreshToken(account.encryptedRefreshToken);
        if (!refreshToken) continue;

        const client = await createGoogleOAuthClient(storedEnv!);
        client.setCredentials({ refresh_token: refreshToken });

        await syncGoogleAccountCalendarList(account.id, account.userId, client);
        await syncGoogleAccountEvents(account.id, client);
        synced++;
      } catch (err) {
        logger.warn('Background calendar sync failed for account', {
          accountId: account.id,
          userId: account.userId,
          error: String(err),
        });
        await markAccountSyncError(account.id, err);
      }
    }

    return synced;
  });

  if (!result.ok) return 0;
  return result.value;
}
