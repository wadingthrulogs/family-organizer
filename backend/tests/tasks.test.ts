import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Tasks API', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];

  beforeAll(async () => {
    await resetDatabase();
    ({ agent } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.taskAssignment.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates and lists tasks', async () => {
    const payload = { title: 'Test Task', priority: 2 };

    const createResponse = await agent.post('/api/v1/tasks').send(payload).expect(201);
    expect(createResponse.body).toMatchObject({ title: 'Test Task', priority: 2, status: 'OPEN' });

    const listResponse = await agent.get('/api/v1/tasks').expect(200);
    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.items[0].title).toBe('Test Task');
  });

  it('updates and soft deletes a task', async () => {
    const created = await prisma.task.create({ data: { title: 'Original Task' } });

    await agent
      .patch(`/api/v1/tasks/${created.id}`)
      .send({ title: 'Updated Task', status: 'DONE' })
      .expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.title).toBe('Updated Task');
    expect(updated.status).toBe('DONE');

    await agent.delete(`/api/v1/tasks/${created.id}`).expect(204);

    const deleted = await prisma.task.findUniqueOrThrow({ where: { id: created.id } });
    expect(deleted.deletedAt).not.toBeNull();
  });
});
