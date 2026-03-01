import { Router } from 'express';

import type { AppEnv } from '../config/env.js';
import { buildGoogleRouter } from './integrations/google.js';

export function integrationsRouter(env: AppEnv) {
  const router = Router();

  router.use('/google', buildGoogleRouter(env));

  return router;
}
