import { Router } from 'express';

import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

export const backupRouter = Router();

/**
 * GET /api/v1/backup/export
 * Exports the entire database as a JSON snapshot.
 * Useful for manual backups and migration.
 */
backupRouter.get(
  '/export',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const [
      users,
      tasks,
      taskRecurrences,
      taskAssignments,
      chores,
      choreAssignments,
      groceryLists,
      groceryItems,
      inventoryItems,
      reminders,
      reminderTriggers,
      familyEvents,
      linkedCalendars,
    ] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          timezone: true,
          colorHex: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.task.findMany({ where: { deletedAt: null } }),
      prisma.taskRecurrence.findMany(),
      prisma.taskAssignment.findMany(),
      prisma.chore.findMany(),
      prisma.choreAssignment.findMany(),
      prisma.groceryList.findMany(),
      prisma.groceryItem.findMany(),
      prisma.inventoryItem.findMany(),
      prisma.reminder.findMany(),
      prisma.reminderTrigger.findMany(),
      prisma.familyEvent.findMany({ where: { deleted: false } }),
      prisma.linkedCalendar.findMany({
        select: {
          id: true,
          userId: true,
          googleId: true,
          displayName: true,
          colorHex: true,
          accessRole: true,
          createdAt: true,
        },
      }),
    ]);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        users,
        tasks,
        taskRecurrences,
        taskAssignments,
        chores,
        choreAssignments,
        groceryLists,
        groceryItems,
        inventoryItems,
        reminders,
        reminderTriggers,
        familyEvents,
        linkedCalendars,
      },
    };

    const filename = `family-organizer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  })
);

/**
 * POST /api/v1/backup/import
 * Imports data from a JSON backup.
 * WARNING: This will add data to existing tables, not replace.
 * It's designed for restoring to a fresh database.
 */
backupRouter.post(
  '/import',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        error: { code: 'INVALID_PAYLOAD', message: 'Missing "data" field in import payload' },
      });
    }

    const counts = {
      tasks: 0,
      chores: 0,
      groceryLists: 0,
      inventoryItems: 0,
      reminders: 0,
    };

    // Import tasks
    if (Array.isArray(data.tasks)) {
      for (const task of data.tasks) {
        await prisma.task.create({
          data: {
            title: task.title,
            description: task.description ?? null,
            dueAt: task.dueAt ? new Date(task.dueAt) : null,
            priority: task.priority ?? 0,
            status: task.status ?? 'OPEN',
            labels: task.labels ?? null,
          },
        });
        counts.tasks++;
      }
    }

    // Import chores
    if (Array.isArray(data.chores)) {
      for (const chore of data.chores) {
        await prisma.chore.create({
          data: {
            title: chore.title,
            description: chore.description ?? null,
            rotationType: chore.rotationType ?? 'ROUND_ROBIN',
            frequency: chore.frequency ?? 'WEEKLY',
            interval: chore.interval ?? 1,
            eligibleUserIds: chore.eligibleUserIds ?? '1',
            weightMapJson: chore.weightMapJson ?? null,
            rewardPoints: chore.rewardPoints ?? 0,
            active: chore.active ?? true,
          },
        });
        counts.chores++;
      }
    }

    // Import grocery lists
    if (Array.isArray(data.groceryLists)) {
      for (const list of data.groceryLists) {
        const created = await prisma.groceryList.create({
          data: {
            name: list.name,
            store: list.store ?? null,
            isActive: list.isActive ?? true,
          },
        });

        // Import items for this list if any
        const listItems = Array.isArray(data.groceryItems)
          ? data.groceryItems.filter((i: { listId: number }) => i.listId === list.id)
          : [];

        for (const item of listItems) {
          await prisma.groceryItem.create({
            data: {
              listId: created.id,
              name: item.name,
              category: item.category ?? null,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? null,
              state: item.state ?? 'NEEDED',
              notes: item.notes ?? null,
            },
          });
        }
        counts.groceryLists++;
      }
    }

    // Import inventory items
    if (Array.isArray(data.inventoryItems)) {
      for (const item of data.inventoryItems) {
        await prisma.inventoryItem.create({
          data: {
            name: item.name,
            category: item.category ?? null,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            pantryItemKey: null, // Don't duplicate unique keys
            lowStockThreshold: item.lowStockThreshold ?? null,
            notes: item.notes ?? null,
          },
        });
        counts.inventoryItems++;
      }
    }

    // Import reminders
    if (Array.isArray(data.reminders)) {
      for (const reminder of data.reminders) {
        await prisma.reminder.create({
          data: {
            ownerUserId: req.session.userId!, // Use the authenticated admin's ID
            title: reminder.title,
            message: reminder.message ?? null,
            targetType: reminder.targetType ?? 'STANDALONE',
            channelMask: reminder.channelMask ?? 1,
            leadTimeMinutes: reminder.leadTimeMinutes ?? 0,
            quietHoursStart: reminder.quietHoursStart ?? null,
            quietHoursEnd: reminder.quietHoursEnd ?? null,
            enabled: reminder.enabled ?? true,
          },
        });
        counts.reminders++;
      }
    }

    res.json({ message: 'Import completed', counts });
  })
);
