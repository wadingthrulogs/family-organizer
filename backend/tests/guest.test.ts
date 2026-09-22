import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildAuthenticatedAgent, buildTestApp, resetDatabase } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

describe('Guest content API — reading list', () => {
  const app = buildTestApp();
  let agent: Awaited<ReturnType<typeof buildAuthenticatedAgent>>['agent'];

  beforeAll(async () => {
    await resetDatabase();
    ({ agent } = await buildAuthenticatedAgent(app));
  });

  afterEach(async () => {
    await prisma.householdSetting.deleteMany({ where: { key: 'guest_books' } });
  });

  afterAll(async () => {
    await resetDatabase();
  });

  const save = (books: unknown[]) =>
    agent.patch('/api/v1/guest/content').send({ books }).expect(200);

  it('defaults a new book to unfinished and records when it is finished', async () => {
    const created = await save([{ title: 'Piranesi', author: 'Susanna Clarke' }]);
    const book = created.body.books[0];
    expect(book.finishedAt).toBeNull();

    const finishedAt = '2026-09-22T17:30:00.000Z';
    const updated = await save([{ ...book, finishedAt }]);
    expect(updated.body.books[0].finishedAt).toBe(finishedAt);
    expect(updated.body.books[0].id).toBe(book.id);
  });

  it('moves a book back to being read when finishedAt is cleared', async () => {
    const created = await save([{ title: 'Dune', finishedAt: '2026-09-01T00:00:00.000Z' }]);
    const book = created.body.books[0];
    expect(book.finishedAt).toBe('2026-09-01T00:00:00.000Z');

    const reopened = await save([{ ...book, finishedAt: null }]);
    expect(reopened.body.books[0].finishedAt).toBeNull();
  });

  it('keeps only the newest 12 finished books, never dropping one still being read', async () => {
    const finished = Array.from({ length: 15 }, (_, i) => ({
      title: `Finished ${i}`,
      // Ascending dates: "Finished 0" is the oldest, so it should fall off first.
      finishedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const res = await save([...finished, { title: 'Still reading' }]);

    const titles = res.body.books.map((b: { title: string }) => b.title);
    expect(titles).toContain('Still reading');
    expect(titles).toContain('Finished 14');
    expect(titles).not.toContain('Finished 0');
    expect(titles).not.toContain('Finished 2');
    expect(res.body.books.filter((b: { finishedAt: string | null }) => b.finishedAt)).toHaveLength(12);
  });

  it('reads back books saved before finishedAt existed', async () => {
    // A row written by the previous version of this route.
    await prisma.householdSetting.create({
      data: {
        key: 'guest_books',
        value: JSON.stringify([
          { id: 'legacy-1', title: 'Old Book', author: '', reader: '', progress: null, coverAttachmentId: null, synopsis: '', year: null, enrichStatus: null, enrichError: null, enrichRequestedAt: null, enrichedAt: null },
        ]),
      },
    });

    const res = await agent.get('/api/v1/guest/content').expect(200);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe('Old Book');
    expect(res.body.books[0].finishedAt).toBeNull();
  });
});
