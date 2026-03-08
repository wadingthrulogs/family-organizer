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
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.SESSION_SECURE,
        maxAge: 1000 * 60 * 60 * 24 * 7,
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

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1', buildApiRouter(env));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
