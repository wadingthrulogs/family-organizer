import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, resetDatabase } from './helpers.js';

const ADMIN_PASSWORD = 'Admin1234!';
const MEMBER_PASSWORD = 'Member1234!';

describe('Backup API', () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('rejects unauthenticated export', async () => {
    await request(app).get('/api/v1/backup/export').expect(401);
  });

  it('rejects unauthenticated import', async () => {
    await request(app)
      .post('/api/v1/backup/import')
      .send({ data: {} })
      .expect(401);
  });

  it('rejects export for non-admin (MEMBER) users', async () => {
    // Register first user as ADMIN, second as MEMBER
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/register')
      .send({ username: 'backup_admin', password: ADMIN_PASSWORD })
      .expect(201);

    const memberAgent = request.agent(app);
    await memberAgent
      .post('/api/v1/auth/register')
      .send({ username: 'backup_member', password: MEMBER_PASSWORD, role: 'MEMBER' })
      .expect(201);

    await memberAgent.get('/api/v1/backup/export').expect(403);
    await memberAgent.post('/api/v1/backup/import').send({ data: {} }).expect(403);
  });

  it('allows admin to export the database', async () => {
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/login')
      .send({ username: 'backup_admin', password: ADMIN_PASSWORD })
      .expect(200);

    const res = await adminAgent.get('/api/v1/backup/export').expect(200);

    expect(res.headers['content-disposition']).toMatch(/attachment; filename="family-organizer-backup-.+\.json"/);
    expect(res.body).toMatchObject({
      version: '1.0.0',
      data: expect.objectContaining({
        users: expect.any(Array),
        tasks: expect.any(Array),
      }),
    });
  });

  it('allows admin to import data', async () => {
    const adminAgent = request.agent(app);
    await adminAgent
      .post('/api/v1/auth/login')
      .send({ username: 'backup_admin', password: ADMIN_PASSWORD })
      .expect(200);

    const res = await adminAgent
      .post('/api/v1/backup/import')
      .send({
        data: {
          tasks: [{ title: 'Imported Task', priority: 1, status: 'OPEN' }],
          chores: [],
          groceryLists: [],
          inventoryItems: [],
          reminders: [],
        },
      })
      .expect(200);

    expect(res.body).toMatchObject({
      message: 'Import completed',
      counts: { tasks: 1, chores: 0, groceryLists: 0, inventoryItems: 0, reminders: 0 },
    });
  });
});
