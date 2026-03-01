import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Calendar API', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];

  beforeAll(async () => {
    await resetDatabase();
    ({ agent } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.familyEvent.deleteMany();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates and fetches events within a range', async () => {
    const payload = {
      title: 'Meeting',
      startAt: new Date('2026-02-14T10:00:00Z').toISOString(),
      endAt: new Date('2026-02-14T11:00:00Z').toISOString(),
      timezone: 'UTC',
    };

    await agent.post('/api/v1/calendar/events').send(payload).expect(201);

    const response = await agent
      .get('/api/v1/calendar/events')
      .query({ start: '2026-02-14T00:00:00Z', end: '2026-02-15T00:00:00Z' })
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe('Meeting');
  });

  it('returns 400 when end precedes start', async () => {
    await agent
      .get('/api/v1/calendar/events')
      .query({ start: '2026-02-15T00:00:00Z', end: '2026-02-14T00:00:00Z' })
      .expect(400);
  });
});
