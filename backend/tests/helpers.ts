import request from 'supertest';

import { loadEnv } from '../src/config/env.js';
import { createApp } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  APP_BASE_URL: 'http://localhost:4173',
  SESSION_SECRET: 'test_secret_session_key',
  SQLITE_PATH: './tests/test-session.db',
  DATABASE_URL: 'file:./tests/test.db',
  ENCRYPTION_KEY: '12345678901234567890123456789012',
});

export function buildTestApp() {
  return createApp(testEnv);
}

export async function resetDatabase() {
  await prisma.$transaction([
    prisma.searchIndex.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.reminderTrigger.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.groceryItem.deleteMany(),
    prisma.groceryList.deleteMany(),
    prisma.choreAssignment.deleteMany(),
    prisma.chore.deleteMany(),
    prisma.taskAssignment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.taskRecurrence.deleteMany(),
    prisma.familyEvent.deleteMany(),
    prisma.linkedCalendar.deleteMany(),
    prisma.userSecret.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function seedUser(overrides: Partial<{ username: string; role: string }> = {}) {
  return prisma.user.create({
    data: {
      username: overrides.username ?? 'tester',
      email: `${overrides.username ?? 'tester'}@example.com`,
      passwordHash: 'hash',
      role: overrides.role ?? 'MEMBER',
    },
  });
}

/**
 * Registers an admin user via the API and returns a supertest agent
 * with a valid session cookie, plus the new user's ID.
 * Call this after resetDatabase() so the first user auto-becomes ADMIN.
 */
export async function buildAuthenticatedAgent(app: ReturnType<typeof buildTestApp>) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/register')
    .send({ username: 'testadmin', password: 'Admin1234!' })
    .expect(201);
  return { agent, userId: res.body.id as number };
}
