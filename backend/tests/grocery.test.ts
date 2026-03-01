import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Grocery API', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];

  beforeAll(async () => {
    await resetDatabase();
    ({ agent } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.groceryItem.deleteMany();
    await prisma.groceryList.deleteMany();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates lists and items', async () => {
    const listResponse = await agent
      .post('/api/v1/grocery/lists')
      .send({ name: 'Weekly Staples' })
      .expect(201);

    const listId = listResponse.body.id;

    await agent
      .post(`/api/v1/grocery/lists/${listId}/items`)
      .send({ name: 'Milk', quantity: 2 })
      .expect(201);

    const itemResponse = await agent.get(`/api/v1/grocery/lists/${listId}/items`).expect(200);
    expect(itemResponse.body.items).toHaveLength(1);
    expect(itemResponse.body.items[0].name).toBe('Milk');
  });

  it('updates and deletes grocery resources', async () => {
    const list = await prisma.groceryList.create({ data: { name: 'Pantry' } });
    const item = await prisma.groceryItem.create({ data: { listId: list.id, name: 'Beans' } });

    await agent
      .patch(`/api/v1/grocery/lists/${list.id}`)
      .send({ name: 'Pantry Updated' })
      .expect(200);

    await agent
      .patch(`/api/v1/grocery/lists/${list.id}/items/${item.id}`)
      .send({ name: 'Black Beans', state: 'IN_CART' })
      .expect(200);

    const updatedItem = await prisma.groceryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updatedItem.name).toBe('Black Beans');
    expect(updatedItem.state).toBe('IN_CART');

    await agent.delete(`/api/v1/grocery/lists/${list.id}/items/${item.id}`).expect(204);
    await agent.delete(`/api/v1/grocery/lists/${list.id}`).expect(204);

    const remainingItems = await prisma.groceryItem.findMany({ where: { listId: list.id } });
    expect(remainingItems).toHaveLength(0);
  });
});
