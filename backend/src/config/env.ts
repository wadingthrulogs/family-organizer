import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:4173'),
  SESSION_SECRET: z.string().min(16),
  SQLITE_PATH: z.string().default('./data/app.db'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  ENCRYPTION_KEY: z.string().min(32),
  SESSION_SECURE: z.string().default('false').transform(v => v === 'true'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URL: z.string().url().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  WEBHOOK_URL: z.string().url().optional(),
  PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),
  TZ: z.string().default('UTC'),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(overrides: Partial<Record<keyof AppEnv, string>> = {}): AppEnv {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(merged);

  if (!parsed.success) {
    console.error('Environment validation failed:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  const data = parsed.data;
  if (!data.GOOGLE_REDIRECT_URL) {
    const base = data.APP_BASE_URL.replace(/\/$/, '');
    data.GOOGLE_REDIRECT_URL = `${base}/api/v1/integrations/google/callback`;
  }

  return data;
}
