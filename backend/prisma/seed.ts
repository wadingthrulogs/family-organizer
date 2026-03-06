import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' } },
});

async function main() {
  console.log('Seeding database...');

  // --- Admin user ---
  const passwordHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash, role: 'ADMIN' },
    create: {
      username: 'admin',
      email: 'admin@family.local',
      passwordHash,
      role: 'ADMIN',
      colorHex: '#6366f1',
    },
  });
  console.log(`  User: ${admin.username} (id=${admin.id})`);

  // --- Tasks ---
  const task1 = await prisma.task.create({
    data: {
      title: 'Fix the leaky faucet',
      description: 'Kitchen sink has been dripping for a week.',
      priority: 3,
      status: 'OPEN',
      authorUserId: admin.id,
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    },
  });
  const task2 = await prisma.task.create({
    data: {
      title: 'Schedule car service',
      priority: 2,
      status: 'IN_PROGRESS',
      authorUserId: admin.id,
    },
  });
  await prisma.task.create({
    data: {
      title: 'Call insurance company',
      priority: 1,
      status: 'DONE',
      authorUserId: admin.id,
    },
  });
  console.log('  Tasks: 3 created');

  // Assign task1 to admin
  await prisma.taskAssignment.create({
    data: { taskId: task1.id, userId: admin.id, status: 'OPEN' },
  });

  // --- Reminder tied to task1 ---
  await prisma.reminder.create({
    data: {
      ownerUserId: admin.id,
      title: 'Faucet deadline',
      message: 'Fix that leaky faucet before the weekend!',
      targetType: 'TASK',
      targetId: task1.id,
      channelMask: 1,
      leadTimeMinutes: 60,
      enabled: true,
    },
  });
  console.log('  Reminder: 1 created');

  // --- Chores ---
  const windowStart = new Date();
  const windowEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const chore1 = await prisma.chore.create({
    data: {
      title: 'Take out trash',
      rotationType: 'ROUND_ROBIN',
      frequency: 'WEEKLY',
      interval: 1,
      eligibleUserIds: String(admin.id),
      rewardPoints: 5,
      active: true,
    },
  });
  await prisma.choreAssignment.create({
    data: {
      choreId: chore1.id,
      userId: admin.id,
      windowStart,
      windowEnd,
      state: 'PENDING',
      rotationOrder: 0,
    },
  });

  const chore2 = await prisma.chore.create({
    data: {
      title: 'Vacuum living room',
      rotationType: 'ROUND_ROBIN',
      frequency: 'WEEKLY',
      interval: 1,
      eligibleUserIds: String(admin.id),
      rewardPoints: 10,
      active: true,
    },
  });
  await prisma.choreAssignment.create({
    data: {
      choreId: chore2.id,
      userId: admin.id,
      windowStart,
      windowEnd,
      state: 'PENDING',
      rotationOrder: 0,
    },
  });
  console.log('  Chores: 2 created with assignments');

  // --- Grocery list ---
  const groceryList = await prisma.groceryList.create({
    data: {
      ownerUserId: admin.id,
      name: 'Weekly Shop',
      store: 'Costco',
      isActive: true,
    },
  });
  const groceryItems = [
    { name: 'Milk', category: 'Dairy', quantity: 1, unit: 'gallon', state: 'NEEDED' },
    { name: 'Eggs', category: 'Dairy', quantity: 2, unit: 'dozen', state: 'NEEDED' },
    { name: 'Bread', category: 'Bakery', quantity: 1, unit: 'loaf', state: 'CLAIMED' },
    { name: 'Chicken breast', category: 'Meat', quantity: 3, unit: 'lb', state: 'NEEDED' },
    { name: 'Bananas', category: 'Produce', quantity: 1, unit: 'bunch', state: 'IN_CART' },
  ];
  for (let i = 0; i < groceryItems.length; i++) {
    await prisma.groceryItem.create({
      data: { listId: groceryList.id, sortOrder: i, ...groceryItems[i] },
    });
  }
  console.log('  Grocery list: "Weekly Shop" with 5 items');

  // --- Inventory ---
  const inventoryItems = [
    { name: 'Paper towels', category: 'Household', quantity: 2, unit: 'rolls', lowStockThreshold: 4 },
    { name: 'Dish soap', category: 'Cleaning', quantity: 1, unit: 'bottle', lowStockThreshold: 2 },
    { name: 'Laundry detergent', category: 'Cleaning', quantity: 5, unit: 'pods', lowStockThreshold: 10 },
    { name: 'Olive oil', category: 'Pantry', quantity: 1, unit: 'bottle', lowStockThreshold: 1 },
  ];
  for (const item of inventoryItems) {
    await prisma.inventoryItem.create({ data: item });
  }
  console.log('  Inventory: 4 items (2 below low-stock threshold)');

  console.log('\nSeeding complete!');
  console.log('  Login at http://localhost:80');
  console.log('  Username: admin');
  console.log('  Password: Admin1234!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
