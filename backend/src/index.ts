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
  const app = createApp(env);
  const server = createServer(app);

  // Initialize push notification support (env vars — DB may override below)
  initVapid(env.PUSH_VAPID_PUBLIC_KEY, env.PUSH_VAPID_PRIVATE_KEY);

  // Initialize email (SMTP) support (env vars — DB may override below)
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

  // DB values override env vars — ensures UI-saved settings survive restarts
  try {
    const dbCfg = await loadServerConfig();
    if (dbCfg.smtpHost) {
      initMailer({ host: dbCfg.smtpHost, port: dbCfg.smtpPort, user: dbCfg.smtpUser, pass: dbCfg.smtpPass, from: dbCfg.smtpFrom });
    }
    if (dbCfg.pushVapidPublicKey) {
      initVapid(dbCfg.pushVapidPublicKey, dbCfg.pushVapidPrivateKey);
    }
    if (dbCfg.openweatherApiKey) {
      setOpenWeatherApiKey(dbCfg.openweatherApiKey);
    }
  } catch (err) {
    logger.warn('Could not load server config from DB at startup', { err });
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
