import { createServer } from 'node:http';

import { loadEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { initMailer } from './lib/mailer.js';
import { createApp } from './server.js';
import { initVapid, setWebhookUrl, startNotificationTicker, stopNotificationTicker } from './services/notification-engine.js';
import { initBackgroundSync } from './services/background-sync.js';
import { loadServerConfig } from './routes/settings.js';
import { setOpenWeatherApiKey } from './routes/weather.js';

async function bootstrap() {
  const env = loadEnv();

  // DB values override env vars — must happen before createApp() so CORS and
  // Google OAuth redirect URL are configured with the correct APP_BASE_URL.
  try {
    const dbCfg = await loadServerConfig();
    if (dbCfg.appBaseUrl) {
      env.APP_BASE_URL = dbCfg.appBaseUrl;
      // Re-derive the Google redirect URL from the updated base URL
      env.GOOGLE_REDIRECT_URL = env.GOOGLE_REDIRECT_URL ?? `${dbCfg.appBaseUrl}/api/v1/integrations/google/callback`;
    }
    if (dbCfg.smtpHost)            { env.SMTP_HOST = dbCfg.smtpHost; }
    if (dbCfg.smtpPort)            { env.SMTP_PORT = dbCfg.smtpPort; }
    if (dbCfg.smtpUser)            { env.SMTP_USER = dbCfg.smtpUser; }
    if (dbCfg.smtpPass)            { env.SMTP_PASS = dbCfg.smtpPass; }
    if (dbCfg.smtpFrom)            { env.SMTP_FROM = dbCfg.smtpFrom; }
    if (dbCfg.pushVapidPublicKey)  { env.PUSH_VAPID_PUBLIC_KEY  = dbCfg.pushVapidPublicKey; }
    if (dbCfg.pushVapidPrivateKey) { env.PUSH_VAPID_PRIVATE_KEY = dbCfg.pushVapidPrivateKey; }
    if (dbCfg.openweatherApiKey)   { env.OPENWEATHER_API_KEY    = dbCfg.openweatherApiKey; }
  } catch (err) {
    logger.warn('Could not load server config from DB at startup', { err });
  }

  const app = createApp(env);
  const server = createServer(app);

  // Initialize push notification support
  initVapid(env.PUSH_VAPID_PUBLIC_KEY, env.PUSH_VAPID_PRIVATE_KEY);

  // Initialize email (SMTP) support
  initMailer({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  });

  // Initialize webhook delivery
  setWebhookUrl(env.WEBHOOK_URL);

  // Initialize background calendar sync
  initBackgroundSync(env);

  // Initialize OpenWeather if set
  if (env.OPENWEATHER_API_KEY) {
    setOpenWeatherApiKey(env.OPENWEATHER_API_KEY);
  }

  // Start notification processing loop (every 60 seconds)
  startNotificationTicker(60_000);

  server.listen(env.PORT, () => {
    logger.info('API server listening', { port: env.PORT });
  });

  const shutdown = () => {
    logger.info('Graceful shutdown requested');
    stopNotificationTicker();
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
