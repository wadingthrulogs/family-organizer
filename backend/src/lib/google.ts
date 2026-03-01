import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { AppEnv } from '../config/env.js';
import { prisma } from './prisma.js';
import { decryptSecret } from './secrets.js';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
}

export async function resolveGoogleCredentials(env: AppEnv): Promise<GoogleCredentials | null> {
  // Load from DB (takes precedence over env vars)
  const rows = await prisma.householdSetting.findMany({
    where: { key: { in: ['google_client_id', 'google_client_secret'] } },
  });

  const rowMap: Record<string, string> = {};
  for (const row of rows) {
    rowMap[row.key] = row.value;
  }

  let clientId: string | undefined;
  let clientSecret: string | undefined;

  // Resolve client ID (stored as plain JSON string in DB)
  const dbClientId = rowMap['google_client_id'];
  if (dbClientId) {
    try {
      clientId = JSON.parse(dbClientId) as string;
    } catch {
      clientId = dbClientId;
    }
  }
  if (!clientId) {
    clientId = env.GOOGLE_CLIENT_ID;
  }

  // Resolve client secret (stored encrypted as enc:<base64> in DB)
  const dbClientSecret = rowMap['google_client_secret'];
  if (dbClientSecret && dbClientSecret.startsWith('enc:')) {
    try {
      const b64 = dbClientSecret.slice(4);
      const buf = Buffer.from(b64, 'base64');
      clientSecret = decryptSecret(buf);
    } catch {
      // decryption failed — fall through to env var
    }
  }
  if (!clientSecret) {
    clientSecret = env.GOOGLE_CLIENT_SECRET;
  }

  if (!clientId || !clientSecret) {
    return null;
  }

  const redirectUrl =
    env.GOOGLE_REDIRECT_URL ?? env.APP_BASE_URL + '/api/v1/integrations/google/callback';

  return { clientId, clientSecret, redirectUrl };
}

export async function createGoogleOAuthClient(env: AppEnv): Promise<OAuth2Client> {
  const creds = await resolveGoogleCredentials(env);
  if (!creds) {
    throw Object.assign(new Error('Google OAuth credentials are not configured. Set them in Settings.'), {
      code: 'GOOGLE_NOT_CONFIGURED',
      status: 422,
    });
  }
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUrl);
}

export async function buildGoogleAuthUrl(
  env: AppEnv,
  state: string,
  { forcePrompt, loginHint }: { forcePrompt?: boolean; loginHint?: string } = {}
) {
  const client = await createGoogleOAuthClient(env);
  return client.generateAuthUrl({
    access_type: 'offline',
    include_granted_scopes: true,
    scope: GOOGLE_CALENDAR_SCOPES,
    state,
    prompt: forcePrompt ? 'consent' : undefined,
    login_hint: loginHint,
  });
}

export function calendarApi(client: OAuth2Client) {
  return google.calendar({ version: 'v3', auth: client });
}
