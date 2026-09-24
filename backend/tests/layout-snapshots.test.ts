import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Saved dashboard layouts', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];
  let userId: number;

  const config = (n: number) => ({ slots: Array.from({ length: n }, (_, i) => ({ widgetId: 'clock', layout: { i: `slot-${i}` } })) });

  beforeAll(async () => {
    await resetDatabase();
    ({ agent, userId } = await buildAuthenticatedAgent(app));
  });

  beforeEach(async () => {
    await prisma.userPreference.updateMany({ where: { userId }, data: { layoutSnapshots: null } });
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('saves a named layout and lists it back', async () => {
    const res = await agent
      .post('/api/v1/settings/me/layouts')
      .send({ name: 'good layout', mode: 'dashboard', config: config(3) })
      .expect(201);

    expect(res.body.saved.name).toBe('good layout');
    expect(res.body.saved.mode).toBe('dashboard');
    expect(res.body.saved.savedAt).toBeTruthy();
    expect(res.body.saved.config.slots).toHaveLength(3);

    const list = await agent.get('/api/v1/settings/me/layouts').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(res.body.saved.id);
  });

  it('keeps each display’s layouts separate', async () => {
    for (const mode of ['dashboard', 'kiosk', 'guest']) {
      await agent.post('/api/v1/settings/me/layouts').send({ name: 'mine', mode, config: config(1) }).expect(201);
    }
    const list = await agent.get('/api/v1/settings/me/layouts').expect(200);
    expect(list.body.items.map((s: { mode: string }) => s.mode).sort()).toEqual(['dashboard', 'guest', 'kiosk']);
  });

  it('replaces a layout saved under the same name for the same display', async () => {
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'Good', mode: 'dashboard', config: config(2) }).expect(201);
    const second = await agent
      .post('/api/v1/settings/me/layouts')
      .send({ name: 'good', mode: 'dashboard', config: config(5) })
      .expect(201);

    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].config.slots).toHaveLength(5);
  });

  it('does not treat the same name on another display as a replacement', async () => {
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'mine', mode: 'dashboard', config: config(1) }).expect(201);
    const res = await agent.post('/api/v1/settings/me/layouts').send({ name: 'mine', mode: 'guest', config: config(1) }).expect(201);
    expect(res.body.items).toHaveLength(2);
  });

  it('deletes one layout and leaves the rest', async () => {
    const a = await agent.post('/api/v1/settings/me/layouts').send({ name: 'a', mode: 'dashboard', config: config(1) }).expect(201);
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'b', mode: 'dashboard', config: config(1) }).expect(201);

    const res = await agent.delete(`/api/v1/settings/me/layouts/${a.body.saved.id}`).expect(200);
    expect(res.body.items.map((s: { name: string }) => s.name)).toEqual(['b']);

    await agent.delete(`/api/v1/settings/me/layouts/${a.body.saved.id}`).expect(404);
  });

  it('rejects a bad mode and a nameless layout', async () => {
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'x', mode: 'nope', config: config(1) }).expect(400);
    await agent.post('/api/v1/settings/me/layouts').send({ name: '   ', mode: 'dashboard', config: config(1) }).expect(400);
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'x', mode: 'dashboard', config: { nope: true } }).expect(400);
  });

  it('caps the number of saved layouts per display', async () => {
    for (let i = 0; i < 20; i++) {
      await agent.post('/api/v1/settings/me/layouts').send({ name: `layout ${i}`, mode: 'dashboard', config: config(1) }).expect(201);
    }
    const over = await agent
      .post('/api/v1/settings/me/layouts')
      .send({ name: 'one too many', mode: 'dashboard', config: config(1) })
      .expect(409);
    expect(over.body.error.code).toBe('SNAPSHOT_LIMIT_REACHED');

    // The cap is per display, so another one still has room.
    await agent.post('/api/v1/settings/me/layouts').send({ name: 'guest one', mode: 'guest', config: config(1) }).expect(201);
  });

  it('survives a corrupt snapshots row rather than failing the request', async () => {
    await prisma.userPreference.updateMany({ where: { userId }, data: { layoutSnapshots: 'not json{' } });
    const list = await agent.get('/api/v1/settings/me/layouts').expect(200);
    expect(list.body.items).toEqual([]);
  });
});
