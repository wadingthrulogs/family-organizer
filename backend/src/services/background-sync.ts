import { logger } from '../lib/logger.js';
import { createGoogleOAuthClient, resolveGoogleCredentials } from '../lib/google.js';
import { prisma } from '../lib/prisma.js';
import {
  getAllGoogleAccounts,
  decryptAccountRefreshToken,
  syncGoogleAccountCalendarList,
  syncGoogleAccountEvents,
  markAccountSyncError,
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
 * Once per day (after 4 AM local) clears all syncTokens to force a drift-correcting full sync.
 */
export async function runBackgroundCalendarSync(): Promise<number> {
  if (!storedEnv) return 0;

  const creds = await resolveGoogleCredentials(storedEnv);
  if (!creds) return 0;

  const accounts = await getAllGoogleAccounts();
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
    try {
      const refreshToken = decryptAccountRefreshToken(account.encryptedRefreshToken);
      if (!refreshToken) continue;

      const client = await createGoogleOAuthClient(storedEnv);
      client.setCredentials({ refresh_token: refreshToken });

      await syncGoogleAccountCalendarList(account.id, account.userId, client);
      await syncGoogleAccountEvents(account.id, client);
      synced++;
    } catch (err) {
      logger.warn('Background calendar sync failed for account', { accountId: account.id, userId: account.userId, error: String(err) });
      await markAccountSyncError(account.id, err);
    }
  }

  return synced;
}
