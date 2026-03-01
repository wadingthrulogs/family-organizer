import { prisma } from '../lib/prisma.js';

const DEFAULT_USERNAME = 'household-admin';
const DEFAULT_EMAIL = 'admin@household.local';

export async function ensureDefaultUser() {
  const existing = await prisma.user.findFirst({ select: { id: true } });
  if (existing) {
    return existing.id;
  }

  const user = await prisma.user.upsert({
    where: { username: DEFAULT_USERNAME },
    update: {},
    create: {
      username: DEFAULT_USERNAME,
      email: DEFAULT_EMAIL,
      passwordHash: '!disabled!',
      role: 'ADMIN',
    },
    select: { id: true },
  });

  return user.id;
}
