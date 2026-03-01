import { Router } from 'express';

import type { AppEnv } from '../config/env.js';
import { attachmentsRouter } from './attachments.js';
import { authRouter } from './auth.js';
import { backupRouter } from './backup.js';
import { calendarRouter } from './calendar.js';
import { choresRouter } from './chores.js';
import { groceryRouter } from './grocery.js';
import { healthRouter } from './health.js';
import { integrationsRouter } from './integrations.js';
import { inventoryRouter } from './inventory.js';
import { notificationsRouter } from './notifications.js';
import { remindersRouter } from './reminders.js';
import { settingsRouter } from './settings.js';
import { tasksRouter } from './tasks.js';
import { weatherRouter, setOpenWeatherApiKey } from './weather.js';

export function buildApiRouter(env: AppEnv) {
  const router = Router();

  router.use('/auth', authRouter);
  router.use('/attachments', attachmentsRouter);
  router.use('/backup', backupRouter);
  router.use('/health', healthRouter);
  router.use('/calendar', calendarRouter);
  router.use('/tasks', tasksRouter);
  router.use('/chores', choresRouter);
  router.use('/grocery', groceryRouter);
  router.use('/inventory', inventoryRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/reminders', remindersRouter);
  router.use('/settings', settingsRouter);
  router.use('/integrations', integrationsRouter(env));
  setOpenWeatherApiKey(env.OPENWEATHER_API_KEY);
  router.use('/weather', weatherRouter());

  return router;
}
