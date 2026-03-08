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
      householdSettings,
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
      prisma.householdSetting.findMany(),
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
        householdSettings,
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
 * All inserts run inside a single transaction — any unrecoverable error rolls back everything.
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

    // Fetch existing user IDs once so we can safely null-out broken FK references
    const existingUserIds = new Set(
      (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id)
    );

    const counts = {
      tasks: 0,
      taskRecurrences: 0,
      taskAssignments: 0,
      chores: 0,
      choreAssignments: 0,
      groceryLists: 0,
      inventoryItems: 0,
      reminders: 0,
      familyEvents: 0,
      householdSettings: 0,
    };

    await prisma.$transaction(async (tx) => {
      // ── 1. TaskRecurrences ──────────────────────────────────────────────
      const recurrenceIdMap = new Map<number, number>();
      if (Array.isArray(data.taskRecurrences)) {
        for (const rec of data.taskRecurrences) {
          try {
            const created = await tx.taskRecurrence.create({
              data: {
                frequency: rec.frequency,
                interval: rec.interval ?? 1,
                byDay: rec.byDay ?? null,
                byMonthDay: rec.byMonthDay ?? null,
                until: rec.until ? new Date(rec.until) : null,
                count: rec.count ?? null,
              },
            });
            recurrenceIdMap.set(rec.id, created.id);
            counts.taskRecurrences++;
          } catch {
            // skip malformed recurrence records
          }
        }
      }

      // ── 2. Tasks ────────────────────────────────────────────────────────
      const taskIdMap = new Map<number, number>();
      if (Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          try {
            const created = await tx.task.create({
              data: {
                title: task.title,
                description: task.description ?? null,
                dueAt: task.dueAt ? new Date(task.dueAt) : null,
                priority: task.priority ?? 0,
                status: task.status ?? 'OPEN',
                labels: task.labels ?? null,
                recurrenceId: task.recurrenceId ? (recurrenceIdMap.get(task.recurrenceId) ?? null) : null,
              },
            });
            taskIdMap.set(task.id, created.id);
            counts.tasks++;
          } catch {
            // skip malformed task records
          }
        }
      }

      // ── 3. TaskAssignments ──────────────────────────────────────────────
      if (Array.isArray(data.taskAssignments)) {
        for (const assignment of data.taskAssignments) {
          const newTaskId = taskIdMap.get(assignment.taskId);
          if (!newTaskId) continue; // task was skipped or not in backup
          if (!existingUserIds.has(assignment.userId)) continue; // user doesn't exist in target DB
          try {
            await tx.taskAssignment.create({
              data: {
                taskId: newTaskId,
                userId: assignment.userId,
                status: assignment.status ?? 'OPEN',
                progressNote: assignment.progressNote ?? null,
                completedAt: assignment.completedAt ? new Date(assignment.completedAt) : null,
              },
            });
            counts.taskAssignments++;
          } catch {
            // skip duplicates or malformed records
          }
        }
      }

      // ── 4. Chores ───────────────────────────────────────────────────────
      const choreIdMap = new Map<number, number>();
      if (Array.isArray(data.chores)) {
        for (const chore of data.chores) {
          try {
            const created = await tx.chore.create({
              data: {
                title: chore.title,
                description: chore.description ?? null,
                rotationType: chore.rotationType ?? 'ROUND_ROBIN',
                frequency: chore.frequency ?? 'WEEKLY',
                interval: chore.interval ?? 1,
                eligibleUserIds: chore.eligibleUserIds ?? '',
                weightMapJson: chore.weightMapJson ?? null,
                rewardPoints: chore.rewardPoints ?? 0,
                active: chore.active ?? true,
              },
            });
            choreIdMap.set(chore.id, created.id);
            counts.chores++;
          } catch {
            // skip malformed chore records
          }
        }
      }

      // ── 5. ChoreAssignments ─────────────────────────────────────────────
      if (Array.isArray(data.choreAssignments)) {
        for (const assignment of data.choreAssignments) {
          const newChoreId = choreIdMap.get(assignment.choreId);
          if (!newChoreId) continue;
          try {
            await tx.choreAssignment.create({
              data: {
                choreId: newChoreId,
                userId: assignment.userId && existingUserIds.has(assignment.userId) ? assignment.userId : null,
                windowStart: new Date(assignment.windowStart),
                windowEnd: new Date(assignment.windowEnd),
                state: assignment.state ?? 'PENDING',
                rotationOrder: assignment.rotationOrder ?? null,
                notes: assignment.notes ?? null,
                completedAt: assignment.completedAt ? new Date(assignment.completedAt) : null,
              },
            });
            counts.choreAssignments++;
          } catch {
            // skip malformed assignment records
          }
        }
      }

      // ── 6. GroceryLists + GroceryItems ──────────────────────────────────
      if (Array.isArray(data.groceryLists)) {
        for (const list of data.groceryLists) {
          try {
            const created = await tx.groceryList.create({
              data: {
                name: list.name,
                store: list.store ?? null,
                presetKey: list.presetKey ?? null,
                isActive: list.isActive ?? true,
                ownerUserId: list.ownerUserId && existingUserIds.has(list.ownerUserId) ? list.ownerUserId : null,
              },
            });

            const listItems = Array.isArray(data.groceryItems)
              ? data.groceryItems.filter((i: { listId: number }) => i.listId === list.id)
              : [];

            for (const item of listItems) {
              try {
                await tx.groceryItem.create({
                  data: {
                    listId: created.id,
                    name: item.name,
                    category: item.category ?? null,
                    quantity: item.quantity ?? 1,
                    unit: item.unit ?? null,
                    state: item.state ?? 'NEEDED',
                    notes: item.notes ?? null,
                    sortOrder: item.sortOrder ?? null,
                  },
                });
              } catch {
                // skip malformed item records
              }
            }
            counts.groceryLists++;
          } catch {
            // skip malformed list records
          }
        }
      }

      // ── 7. InventoryItems ───────────────────────────────────────────────
      if (Array.isArray(data.inventoryItems)) {
        for (const item of data.inventoryItems) {
          try {
            await tx.inventoryItem.create({
              data: {
                name: item.name,
                category: item.category ?? null,
                quantity: item.quantity ?? 1,
                unit: item.unit ?? null,
                pantryItemKey: null, // Don't duplicate unique keys
                lowStockThreshold: item.lowStockThreshold ?? null,
                notes: item.notes ?? null,
                dateAdded: item.dateAdded ? new Date(item.dateAdded) : new Date(),
              },
            });
            counts.inventoryItems++;
          } catch {
            // skip malformed inventory records
          }
        }
      }

      // ── 8. Reminders ────────────────────────────────────────────────────
      if (Array.isArray(data.reminders)) {
        for (const reminder of data.reminders) {
          try {
            await tx.reminder.create({
              data: {
                ownerUserId: req.session.userId!, // use the authenticated admin's ID
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
          } catch {
            // skip malformed reminder records
          }
        }
      }

      // ── 9. FamilyEvents (LOCAL source only) ─────────────────────────────
      if (Array.isArray(data.familyEvents)) {
        for (const event of data.familyEvents) {
          if (event.source !== 'LOCAL') continue; // skip Google-synced events
          try {
            await tx.familyEvent.create({
              data: {
                source: 'LOCAL',
                linkedCalendarId: null, // don't restore Google calendar links
                title: event.title,
                description: event.description ?? null,
                startAt: new Date(event.startAt),
                endAt: new Date(event.endAt),
                timezone: event.timezone ?? 'UTC',
                allDay: event.allDay ?? false,
                colorHex: event.colorHex ?? null,
                location: event.location ?? null,
                deleted: false,
              },
            });
            counts.familyEvents++;
          } catch {
            // skip malformed event records
          }
        }
      }

      // ── 10. HouseholdSettings ───────────────────────────────────────────
      if (Array.isArray(data.householdSettings)) {
        for (const setting of data.householdSettings) {
          if (!setting.key || setting.value === undefined) continue;
          try {
            await tx.householdSetting.upsert({
              where: { key: setting.key },
              create: { key: setting.key, value: setting.value },
              update: { value: setting.value },
            });
            counts.householdSettings++;
          } catch {
            // skip malformed setting records
          }
        }
      }
    });

    res.json({ message: 'Import completed', counts });
  })
);
