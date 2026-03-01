import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { prisma } from '../lib/prisma.js';
import { encryptSecret, decryptSecret } from '../lib/secrets.js';
import { initMailer } from '../lib/mailer.js';
import { initVapid } from '../services/notification-engine.js';
import { setOpenWeatherApiKey } from './weather.js';

const timePattern = /^\d{2}:\d{2}$/;

const patchHouseholdSchema = z.object({
  householdName:    z.string().trim().min(1).max(100).optional(),
  timezone:         z.string().trim().max(60).optional(),
  quietHours:       z.object({
                      start: z.string().regex(timePattern),
                      end:   z.string().regex(timePattern),
                    }).optional(),
  hiddenTabs:       z.array(z.string().trim().max(50)).max(20).optional(),
  theme:            z.string().trim().max(40).optional(),
  weatherLocation:  z.string().trim().max(200).optional(),
  weatherUnits:     z.enum(['imperial', 'metric']).optional(),
  googleClientId:      z.string().trim().max(200).nullable().optional(),
  googleClientSecret:  z.string().trim().max(200).nullable().optional(),
  appBaseUrl:          z.string().trim().url().max(200).nullable().optional(),
  openweatherApiKey:   z.string().trim().max(200).nullable().optional(),
  smtpHost:            z.string().trim().max(200).nullable().optional(),
  smtpPort:            z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser:            z.string().trim().max(200).nullable().optional(),
  smtpPass:            z.string().trim().max(200).nullable().optional(),
  smtpFrom:            z.string().trim().max(200).nullable().optional(),
  pushVapidPublicKey:  z.string().trim().max(500).nullable().optional(),
  pushVapidPrivateKey: z.string().trim().max(500).nullable().optional(),
}).strict();

/* ─── Household-level settings defaults ─── */
const DEFAULTS: Record<string, unknown> = {
  householdName: 'Sample Household',
  timezone: 'America/New_York',
  quietHours: { start: '21:30', end: '06:30' },
  hiddenTabs: [] as string[],
  theme: 'default',
  weatherLocation: '',
  weatherUnits: 'imperial',
};

// Keys that are encrypted at rest — GET returns a boolean *Set flag, never plaintext
const ENCRYPTED_KEYS = new Set([
  'google_client_secret',
  'openweather_api_key',
  'smtp_pass',
  'push_vapid_public_key',
  'push_vapid_private_key',
]);

// Mapping from DB key to the camelCase boolean flag returned to the client
const ENCRYPTED_KEY_FLAGS: Record<string, string> = {
  google_client_secret:   'googleClientSecretSet',
  openweather_api_key:    'openweatherApiKeySet',
  smtp_pass:              'smtpPassSet',
  push_vapid_public_key:  'pushVapidPublicKeySet',
  push_vapid_private_key: 'pushVapidPrivateKeySet',
};

// Mapping from DB key to camelCase field returned plaintext
const PLAINTEXT_KEY_MAP: Record<string, string> = {
  google_client_id: 'googleClientId',
  app_base_url:     'appBaseUrl',
  smtp_host:        'smtpHost',
  smtp_port:        'smtpPort',
  smtp_user:        'smtpUser',
  smtp_from:        'smtpFrom',
};

async function loadHouseholdSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.householdSetting.findMany();
  const fromDb: Record<string, unknown> = {};

  for (const row of rows) {
    // Encrypted keys → return boolean flag only
    if (ENCRYPTED_KEYS.has(row.key)) {
      fromDb[ENCRYPTED_KEY_FLAGS[row.key]] = true;
      continue;
    }
    // Plaintext mapped keys
    if (row.key in PLAINTEXT_KEY_MAP) {
      try {
        fromDb[PLAINTEXT_KEY_MAP[row.key]] = JSON.parse(row.value) as unknown;
      } catch {
        fromDb[PLAINTEXT_KEY_MAP[row.key]] = row.value;
      }
      continue;
    }
    // All other standard settings
    try {
      fromDb[row.key] = JSON.parse(row.value);
    } catch {
      fromDb[row.key] = row.value;
    }
  }

  // Ensure all boolean flags have a default of false when not set
  for (const flag of Object.values(ENCRYPTED_KEY_FLAGS)) {
    if (!(flag in fromDb)) {
      fromDb[flag] = false;
    }
  }

  return { ...DEFAULTS, ...fromDb };
}

// Internal helper — reads + decrypts all server config from DB for hot-reloading
export async function loadServerConfig(): Promise<{
  appBaseUrl?: string;
  openweatherApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  pushVapidPublicKey?: string;
  pushVapidPrivateKey?: string;
}> {
  const rows = await prisma.householdSetting.findMany({
    where: {
      key: {
        in: [
          'app_base_url',
          'openweather_api_key',
          'smtp_host',
          'smtp_port',
          'smtp_user',
          'smtp_pass',
          'smtp_from',
          'push_vapid_public_key',
          'push_vapid_private_key',
        ],
      },
    },
  });

  const cfg: Record<string, string | number | undefined> = {};

  for (const row of rows) {
    if (row.value.startsWith('enc:')) {
      try {
        const buf = Buffer.from(row.value.slice(4), 'base64');
        cfg[row.key] = decryptSecret(buf);
      } catch {
        // corrupted — skip
      }
    } else {
      try {
        const parsed = JSON.parse(row.value);
        cfg[row.key] = parsed as string | number;
      } catch {
        cfg[row.key] = row.value;
      }
    }
  }

  return {
    appBaseUrl:         cfg['app_base_url'] as string | undefined,
    openweatherApiKey:  cfg['openweather_api_key'] as string | undefined,
    smtpHost:           cfg['smtp_host'] as string | undefined,
    smtpPort:           cfg['smtp_port'] !== undefined ? Number(cfg['smtp_port']) : undefined,
    smtpUser:           cfg['smtp_user'] as string | undefined,
    smtpPass:           cfg['smtp_pass'] as string | undefined,
    smtpFrom:           cfg['smtp_from'] as string | undefined,
    pushVapidPublicKey: cfg['push_vapid_public_key'] as string | undefined,
    pushVapidPrivateKey:cfg['push_vapid_private_key'] as string | undefined,
  };
}

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await loadHouseholdSettings());
  })
);

settingsRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const updates = patchHouseholdSchema.parse(req.body ?? {});

    // Server config fields that only ADMIN may change
    const hasAdminFields =
      updates.googleClientId !== undefined ||
      updates.googleClientSecret !== undefined ||
      updates.appBaseUrl !== undefined ||
      updates.openweatherApiKey !== undefined ||
      updates.smtpHost !== undefined ||
      updates.smtpPort !== undefined ||
      updates.smtpUser !== undefined ||
      updates.smtpPass !== undefined ||
      updates.smtpFrom !== undefined ||
      updates.pushVapidPublicKey !== undefined ||
      updates.pushVapidPrivateKey !== undefined;

    if (hasAdminFields && req.session.role !== 'ADMIN') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can update server configuration.' } });
    }

    const {
      googleClientId,
      googleClientSecret,
      appBaseUrl,
      openweatherApiKey,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      pushVapidPublicKey,
      pushVapidPrivateKey,
      ...rest
    } = updates;

    // Handle standard settings (non-admin fields)
    await Promise.all(
      Object.entries(rest).map(([key, value]) =>
        prisma.householdSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        })
      )
    );

    // Helper: upsert or delete a plaintext setting
    async function upsertPlaintext(key: string, value: string | number | null | undefined) {
      if (value === undefined) return;
      if (value === null || value === '') {
        await prisma.householdSetting.deleteMany({ where: { key } });
      } else {
        await prisma.householdSetting.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value) },
          update: { value: JSON.stringify(value) },
        });
      }
    }

    // Helper: upsert or delete an encrypted setting
    async function upsertEncrypted(key: string, value: string | null | undefined) {
      if (value === undefined) return;
      if (value === null || value === '') {
        await prisma.householdSetting.deleteMany({ where: { key } });
      } else {
        const encrypted = encryptSecret(value);
        const storedValue = 'enc:' + encrypted.toString('base64');
        await prisma.householdSetting.upsert({
          where: { key },
          create: { key, value: storedValue },
          update: { value: storedValue },
        });
      }
    }

    // Plaintext fields
    await upsertPlaintext('google_client_id', googleClientId);
    await upsertPlaintext('app_base_url', appBaseUrl);
    await upsertPlaintext('smtp_host', smtpHost);
    await upsertPlaintext('smtp_port', smtpPort);
    await upsertPlaintext('smtp_user', smtpUser);
    await upsertPlaintext('smtp_from', smtpFrom);

    // Encrypted fields
    await upsertEncrypted('google_client_secret', googleClientSecret);
    await upsertEncrypted('openweather_api_key', openweatherApiKey);
    await upsertEncrypted('smtp_pass', smtpPass);
    await upsertEncrypted('push_vapid_public_key', pushVapidPublicKey);
    await upsertEncrypted('push_vapid_private_key', pushVapidPrivateKey);

    // Hot-reload services if any server config fields changed
    const smtpChanged = smtpHost !== undefined || smtpPort !== undefined ||
      smtpUser !== undefined || smtpPass !== undefined || smtpFrom !== undefined;
    const vapidChanged = pushVapidPublicKey !== undefined || pushVapidPrivateKey !== undefined;
    const weatherChanged = openweatherApiKey !== undefined;

    if (smtpChanged || vapidChanged || weatherChanged) {
      const cfg = await loadServerConfig();
      if (smtpChanged) {
        initMailer({ host: cfg.smtpHost, port: cfg.smtpPort, user: cfg.smtpUser, pass: cfg.smtpPass, from: cfg.smtpFrom });
      }
      if (vapidChanged) {
        initVapid(cfg.pushVapidPublicKey, cfg.pushVapidPrivateKey);
      }
      if (weatherChanged) {
        setOpenWeatherApiKey(cfg.openweatherApiKey);
      }
    }

    res.json(await loadHouseholdSettings());
  })
);

/* ─── Per-user preferences (database-backed) ─── */

const patchMeSchema = z.object({
  theme: z.string().trim().min(1).max(40).optional(),
  dashboardConfig: z.unknown().optional(),
  hiddenTabs: z.array(z.string().trim().max(50)).max(20).optional(),
}).strict();

function serializePreference(pref: { theme: string; dashboardConfig: string | null; hiddenTabs: string | null }) {
  return {
    theme: pref.theme,
    dashboardConfig: pref.dashboardConfig ? JSON.parse(pref.dashboardConfig) : null,
    hiddenTabs: pref.hiddenTabs ? JSON.parse(pref.hiddenTabs) : [],
  };
}

settingsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;

    const pref = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    res.json(serializePreference(pref));
  })
);

settingsRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;

    const { theme, dashboardConfig, hiddenTabs } = patchMeSchema.parse(req.body ?? {});

    const data: Record<string, unknown> = {};
    if (typeof theme === 'string' && theme.length > 0) {
      data.theme = theme;
    }
    if (dashboardConfig !== undefined) {
      data.dashboardConfig = dashboardConfig ? JSON.stringify(dashboardConfig) : null;
    }
    if (hiddenTabs !== undefined) {
      data.hiddenTabs = Array.isArray(hiddenTabs) ? JSON.stringify(hiddenTabs) : null;
    }

    const pref = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    res.json(serializePreference(pref));
  })
);
