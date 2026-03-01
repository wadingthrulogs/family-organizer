import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Reminders API', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];
  let ownerId: number;

  beforeAll(async () => {
    await resetDatabase();
    ({ agent, userId: ownerId } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.reminderTrigger.deleteMany();
    await prisma.reminder.deleteMany();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates and lists reminders', async () => {
    await agent
      .post('/api/v1/reminders')
      .send({ ownerUserId: ownerId, title: 'Reminder', targetType: 'task' })
      .expect(201);

    const listResponse = await agent.get('/api/v1/reminders').expect(200);
    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.items[0].owner.id).toBe(ownerId);
  });

  it('updates and deletes reminders', async () => {
    const reminder = await prisma.reminder.create({
      data: {
        ownerUserId: ownerId,
        title: 'Ping',
        targetType: 'task',
      },
    });

    await agent
      .patch(`/api/v1/reminders/${reminder.id}`)
      .send({ title: 'Ping Updated', enabled: false })
      .expect(200);

    const updated = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(updated.title).toBe('Ping Updated');
    expect(updated.enabled).toBe(false);

    await agent.delete(`/api/v1/reminders/${reminder.id}`).expect(204);
    const remaining = await prisma.reminder.findUnique({ where: { id: reminder.id } });
    expect(remaining).toBeNull();
  });
});
