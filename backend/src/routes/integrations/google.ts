import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import { google } from 'googleapis';

import type { AppEnv } from '../../config/env.js';
import { createGoogleOAuthClient, buildGoogleAuthUrl, resolveGoogleCredentials } from '../../lib/google.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  getGoogleAccounts,
  getGoogleAccountById,
  upsertGoogleAccount,
  decryptAccountRefreshToken,
  removeGoogleAccount,
  syncGoogleAccountCalendarList,
  syncGoogleAccountEvents,
} from '../../services/google-calendar.js';
import { ensureDefaultUser } from '../../services/default-user.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function buildGoogleRouter(env: AppEnv) {
  const router = Router();
  const allowFallbackUser = env.NODE_ENV !== 'production';

  /* ─── GET / — List all connected Google accounts ─── */
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req, allowFallbackUser);
      const accounts = await getGoogleAccounts(userId);

      res.json({
        accounts: accounts.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.displayName,
          lastSyncedAt: a.lastSyncedAt,
          calendars: a.linkedCalendars.map((c) => ({
            id: c.id,
            googleId: c.googleId,
            displayName: c.displayName,
            colorHex: c.colorHex,
            accessRole: c.accessRole,
          })),
        })),
      });
    })
  );

  /* ─── GET /start — Begin OAuth flow (always force consent for new account) ─── */
  router.get(
    '/start',
    asyncHandler(async (req, res) => {
      const creds = await resolveGoogleCredentials(env);
      if (!creds) {
        return res.status(422).json({ error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google OAuth credentials are not configured. Set them in Settings.' } });
      }
      await resolveUserId(req, allowFallbackUser); // ensure session has userId
      const state = randomUUID();
      req.session.googleOAuthState = state;
      const loginHint = typeof req.query.login_hint === 'string' ? req.query.login_hint : undefined;
      // Always force consent so Google returns a refresh_token for the new account
      const url = await buildGoogleAuthUrl(env, state, { forcePrompt: true, loginHint });
      res.json({ url });
    })
  );

  /* ─── GET /callback — Complete OAuth, upsert GoogleAccount ─── */
  router.get(
    '/callback',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req, allowFallbackUser);
      const { state, code, error } = req.query as Record<string, string | undefined>;

      if (error) {
        return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'error', error));
      }

      if (!state || state !== req.session.googleOAuthState) {
        return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'error', 'state_mismatch'));
      }

      if (!code) {
        return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'error', 'missing_code'));
      }

      const client = await createGoogleOAuthClient(env);
      const { tokens } = await client.getToken(code);

      const refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'error', 'missing_refresh_token'));
      }

      // Get the email of the authenticated Google account
      client.setCredentials({ access_token: tokens.access_token, refresh_token: refreshToken });
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;
      if (!email) {
        return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'error', 'missing_email'));
      }

      // Upsert account, then redirect immediately and sync in the background.
      const account = await upsertGoogleAccount(userId, email, refreshToken, userInfo.data.name);
      client.setCredentials({ refresh_token: refreshToken });

      void syncGoogleAccountCalendarList(account.id, userId, client)
        .then(() => syncGoogleAccountEvents(account.id, client))
        .catch((err) => logger.error('Initial Google sync after connect failed', { accountId: account.id, err }));

      req.session.googleOAuthState = undefined;
      return res.redirect(buildSettingsRedirect(env.APP_BASE_URL, 'connected'));
    })
  );

  /* ─── DELETE /:accountId — Disconnect a single Google account ─── */
  router.delete(
    '/:accountId',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req, allowFallbackUser);
      const accountId = Number(req.params.accountId);
      if (isNaN(accountId)) return res.status(400).json({ error: { message: 'Invalid account ID' } });

      // Ensure the account belongs to this user
      const account = await getGoogleAccountById(accountId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: { message: 'Account not found' } });
      }

      await removeGoogleAccount(accountId);
      res.status(204).send();
    })
  );

  /* ─── POST /:accountId/sync — Sync a single Google account ─── */
  router.post(
    '/:accountId/sync',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req, allowFallbackUser);
      const accountId = Number(req.params.accountId);
      if (isNaN(accountId)) return res.status(400).json({ error: { message: 'Invalid account ID' } });

      const account = await getGoogleAccountById(accountId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: { message: 'Account not found' } });
      }

      const refreshToken = decryptAccountRefreshToken(account.encryptedRefreshToken);
      if (!refreshToken) {
        return res.status(400).json({ error: { code: 'TOKEN_DECRYPT_FAILED', message: 'Could not decrypt refresh token' } });
      }

      const client = await createGoogleOAuthClient(env);
      client.setCredentials({ refresh_token: refreshToken });

      res.status(202).json({ message: 'Sync started' });

      void (async () => {
        try {
          await syncGoogleAccountCalendarList(account.id, userId, client);
          await syncGoogleAccountEvents(account.id, client);
        } catch (err) {
          logger.error('Manual Google sync failed', { accountId: account.id, err });
        }
      })();
    })
  );

  /* ─── POST /sync-all — Sync all connected Google accounts ─── */
  router.post(
    '/sync-all',
    asyncHandler(async (req, res) => {
      const userId = await resolveUserId(req, allowFallbackUser);
      const accounts = await getGoogleAccounts(userId);

      res.status(202).json({ message: 'Sync started for all accounts' });

      void (async () => {
        for (const account of accounts) {
          const refreshToken = decryptAccountRefreshToken(account.encryptedRefreshToken);
          if (!refreshToken) continue;

          const client = await createGoogleOAuthClient(env);
          client.setCredentials({ refresh_token: refreshToken });

          try {
            await syncGoogleAccountCalendarList(account.id, userId, client);
            await syncGoogleAccountEvents(account.id, client);
          } catch (err) {
            logger.error('Google sync failed for account', { accountId: account.id, email: account.email, err });
          }
        }
      })();
    })
  );

  return router;
}

async function resolveUserId(req: Request, allowFallbackUser: boolean) {
  if (req.session.userId) {
    return req.session.userId;
  }
  if (!allowFallbackUser) {
    const error = new Error('Authentication required');
    (error as { status?: number }).status = 401;
    throw error;
  }
  const fallback = await prisma.user.findFirst({ select: { id: true } });
  if (fallback) {
    req.session.userId = fallback.id;
    return fallback.id;
  }

  const seededUserId = await ensureDefaultUser();
  req.session.userId = seededUserId;
  return seededUserId;
}

function buildSettingsRedirect(baseUrl: string, status: 'connected' | 'error', reason?: string) {
  const target = new URL('/settings', baseUrl);
  target.searchParams.set('google', status);
  if (reason) {
    target.searchParams.set('reason', reason);
  }
  return target.toString();
}
