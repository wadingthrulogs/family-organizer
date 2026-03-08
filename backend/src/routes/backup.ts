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

    // ── Pre-process data outside the transaction ─────────────────────────
    // Filter and shape all input arrays before touching the DB so that:
    //  (a) the transaction does minimal work, and
    //  (b) we avoid try/catch inside the transaction (which can corrupt the
    //      Prisma transaction context if a query fails mid-flight).

    const recurrences: typeof data.taskRecurrences = Array.isArray(data.taskRecurrences)
      ? data.taskRecurrences.filter((r: { frequency: unknown }) => r.frequency)
      : [];

    const tasks: typeof data.tasks = Array.isArray(data.tasks)
      ? data.tasks.filter((t: { title: unknown }) => typeof t.title === 'string' && t.title)
      : [];

    const taskAssignments: typeof data.taskAssignments = Array.isArray(data.taskAssignments)
      ? data.taskAssignments.filter(
          (a: { taskId: number; userId: number }) => existingUserIds.has(a.userId)
        )
      : [];

    const chores: typeof data.chores = Array.isArray(data.chores)
      ? data.chores.filter((c: { title: unknown }) => typeof c.title === 'string' && c.title)
      : [];

    const choreAssignments: typeof data.choreAssignments = Array.isArray(data.choreAssignments)
      ? data.choreAssignments.filter((a: { windowStart: unknown; windowEnd: unknown }) =>
          a.windowStart && a.windowEnd
        )
      : [];

    const groceryLists: typeof data.groceryLists = Array.isArray(data.groceryLists)
      ? data.groceryLists.filter((l: { name: unknown }) => typeof l.name === 'string' && l.name)
      : [];

    const groceryItems: typeof data.groceryItems = Array.isArray(data.groceryItems)
      ? data.groceryItems
      : [];

    const inventoryItems: typeof data.inventoryItems = Array.isArray(data.inventoryItems)
      ? data.inventoryItems.filter((i: { name: unknown }) => typeof i.name === 'string' && i.name)
      : [];

    const reminders: typeof data.reminders = Array.isArray(data.reminders)
      ? data.reminders.filter((r: { title: unknown }) => typeof r.title === 'string' && r.title)
      : [];

    // Only LOCAL events — Google events belong to synced calendars that won't exist in a new instance
    const localEvents: typeof data.familyEvents = Array.isArray(data.familyEvents)
      ? data.familyEvents.filter(
          (e: { source: string; title: unknown }) =>
            e.source === 'LOCAL' && typeof e.title === 'string' && e.title
        )
      : [];

    const householdSettings: typeof data.householdSettings = Array.isArray(data.householdSettings)
      ? data.householdSettings.filter(
          (s: { key: unknown; value: unknown }) => s.key && s.value !== undefined
        )
      : [];

    // ── Transaction ──────────────────────────────────────────────────────
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
      for (const rec of recurrences) {
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
      }

      // ── 2. Tasks ────────────────────────────────────────────────────────
      const taskIdMap = new Map<number, number>();
      for (const task of tasks) {
        const created = await tx.task.create({
          data: {
            title: task.title,
            description: task.description ?? null,
            dueAt: task.dueAt ? new Date(task.dueAt) : null,
            priority: task.priority ?? 0,
            status: task.status ?? 'OPEN',
            labels: task.labels ?? null,
            recurrenceId: task.recurrenceId
              ? (recurrenceIdMap.get(task.recurrenceId) ?? null)
              : null,
          },
        });
        taskIdMap.set(task.id, created.id);
        counts.tasks++;
      }

      // ── 3. TaskAssignments ──────────────────────────────────────────────
      for (const assignment of taskAssignments) {
        const newTaskId = taskIdMap.get(assignment.taskId);
        if (!newTaskId) continue; // task wasn't in this backup
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
      }

      // ── 4. Chores ───────────────────────────────────────────────────────
      const choreIdMap = new Map<number, number>();
      for (const chore of chores) {
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
      }

      // ── 5. ChoreAssignments ─────────────────────────────────────────────
      for (const assignment of choreAssignments) {
        const newChoreId = choreIdMap.get(assignment.choreId);
        if (!newChoreId) continue;
        await tx.choreAssignment.create({
          data: {
            choreId: newChoreId,
            userId:
              assignment.userId && existingUserIds.has(assignment.userId)
                ? assignment.userId
                : null,
            windowStart: new Date(assignment.windowStart),
            windowEnd: new Date(assignment.windowEnd),
            state: assignment.state ?? 'PENDING',
            rotationOrder: assignment.rotationOrder ?? null,
            notes: assignment.notes ?? null,
            completedAt: assignment.completedAt ? new Date(assignment.completedAt) : null,
          },
        });
        counts.choreAssignments++;
      }

      // ── 6. GroceryLists + GroceryItems ──────────────────────────────────
      for (const list of groceryLists) {
        const created = await tx.groceryList.create({
          data: {
            name: list.name,
            store: list.store ?? null,
            presetKey: list.presetKey ?? null,
            isActive: list.isActive ?? true,
            ownerUserId:
              list.ownerUserId && existingUserIds.has(list.ownerUserId)
                ? list.ownerUserId
                : null,
          },
        });

        const items = groceryItems.filter(
          (i: { listId: number }) => i.listId === list.id
        );
        for (const item of items) {
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
        }
        counts.groceryLists++;
      }

      // ── 7. InventoryItems ───────────────────────────────────────────────
      for (const item of inventoryItems) {
        await tx.inventoryItem.create({
          data: {
            name: item.name,
            category: item.category ?? null,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? null,
            pantryItemKey: null, // don't duplicate unique keys
            lowStockThreshold: item.lowStockThreshold ?? null,
            notes: item.notes ?? null,
            dateAdded: item.dateAdded ? new Date(item.dateAdded) : new Date(),
          },
        });
        counts.inventoryItems++;
      }

      // ── 8. Reminders ────────────────────────────────────────────────────
      for (const reminder of reminders) {
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
      }

      // ── 9. FamilyEvents (LOCAL only, pre-filtered above) ────────────────
      for (const event of localEvents) {
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
      }

      // ── 10. HouseholdSettings ───────────────────────────────────────────
      for (const setting of householdSettings) {
        await tx.householdSetting.upsert({
          where: { key: setting.key },
          create: { key: setting.key, value: setting.value },
          update: { value: setting.value },
        });
        counts.householdSettings++;
      }
    }, { timeout: 30000 });

    res.json({ message: 'Import completed', counts });
  })
);
