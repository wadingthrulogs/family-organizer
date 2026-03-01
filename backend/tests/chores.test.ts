import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Chores API', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];
  let userId: number;

  beforeAll(async () => {
    await resetDatabase();
    ({ agent, userId } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.choreAssignment.deleteMany();
    await prisma.chore.deleteMany();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates and fetches a chore', async () => {
    const payload = {
      title: 'Dishes',
      frequency: 'WEEKLY',
      interval: 1,
      eligibleUserIds: [userId],
    };

    const createResponse = await agent.post('/api/v1/chores').send(payload).expect(201);
    expect(createResponse.body.title).toBe('Dishes');
    expect(createResponse.body.eligibleUserIds).toEqual([userId]);

    const listResponse = await agent.get('/api/v1/chores').expect(200);
    expect(listResponse.body.total).toBe(1);
  });

  it('updates and deletes a chore', async () => {
    const created = await prisma.chore.create({
      data: {
        title: 'Laundry',
        rotationType: 'ROUND_ROBIN',
        frequency: 'WEEKLY',
        interval: 1,
        eligibleUserIds: String(userId),
      },
    });

    await agent
      .patch(`/api/v1/chores/${created.id}`)
      .send({ title: 'Laundry Updated', rewardPoints: 10 })
      .expect(200);

    const updated = await prisma.chore.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated.title).toBe('Laundry Updated');
    expect(updated.rewardPoints).toBe(10);

    await agent.delete(`/api/v1/chores/${created.id}`).expect(204);
    const remaining = await prisma.chore.findUnique({ where: { id: created.id } });
    expect(remaining).toBeNull();
  });

  it('updates a chore assignment state', async () => {
    const chore = await prisma.chore.create({
      data: {
        title: 'Kitchen reset',
        rotationType: 'ROUND_ROBIN',
        frequency: 'WEEKLY',
        interval: 1,
        eligibleUserIds: String(userId),
      },
    });

    const assignment = await prisma.choreAssignment.create({
      data: {
        choreId: chore.id,
        userId,
        windowStart: new Date('2026-01-01T00:00:00Z'),
        windowEnd: new Date('2026-01-02T00:00:00Z'),
        state: 'PENDING',
      },
    });

    await agent
      .patch(`/api/v1/chores/assignments/${assignment.id}`)
      .send({ state: 'COMPLETED', notes: 'Done before dinner' })
      .expect(200);

    const updated = await prisma.choreAssignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(updated.state).toBe('COMPLETED');
    expect(updated.notes).toBe('Done before dinner');
    expect(updated.completedAt).not.toBeNull();
  });
});
