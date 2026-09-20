import path from 'node:path';

import compression from 'compression';
import SQLiteStoreFactory from 'connect-sqlite3';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { json, urlencoded } from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';

import type { AppEnv } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { buildApiRouter } from './routes/index.js';

export function createApp(env: AppEnv) {
  const app = express();
  const SQLiteStore = SQLiteStoreFactory(session);

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_BASE_URL,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  app.use(
    session({
      store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.dirname(env.SQLITE_PATH),
      }) as unknown as session.Store,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // Reset the expiry countdown on every request, so maxAge below means
      // "N days idle" rather than "N days since login". Without this the wall
      // display gets logged out mid-use and every endpoint 401s.
      // Safe with resave:false because connect-sqlite3 implements touch(),
      // so the stored record's expiry is updated alongside the cookie.
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.SESSION_SECURE,
        // 30 days of *inactivity* (rolling above resets this on every request).
        // The wall display is the reason for the length: it should never present
        // a login screen to the household. In practice the dashboard's commute
        // and weather widgets poll every 2-5 minutes, so the countdown never
        // gets near this — but the session must not depend on a particular
        // widget being on the dashboard, which is what 7 days effectively did.
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    })
  );
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Global rate limiter: 200 requests per minute per IP
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Strict rate limiter for auth endpoints: 15 attempts per 15 minutes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later.' } },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/me/pin/verify', authLimiter);

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1', buildApiRouter(env));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
