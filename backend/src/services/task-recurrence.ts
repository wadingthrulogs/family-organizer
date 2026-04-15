import type { Task, TaskRecurrence } from '@prisma/client';

import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/**
 * Compute the next due date for a recurring task instance.
 *
 * Anchors on `currentDueAt` if present, otherwise on `now()`. Returns null
 * when the recurrence chain has been exhausted (e.g. `until` is past).
 *
 * Note: `byDay`, `byMonthDay`, and `count` are intentionally not honored
 * yet — the frontend only exposes frequency + interval, and tracking
 * per-instance counts requires a schema field we don't have. They're
 * accepted for forward compatibility but ignored.
 */
export function computeNextDueAt(
  currentDueAt: Date | null,
  recurrence: Pick<TaskRecurrence, 'frequency' | 'interval' | 'until'>,
): Date | null {
  const now = Date.now();
  if (recurrence.until && recurrence.until.getTime() <= now) {
    return null;
  }

  const anchor = currentDueAt ? new Date(currentDueAt) : new Date(now);
  const interval = Math.max(1, recurrence.interval ?? 1);
  const next = new Date(anchor);

  switch (recurrence.frequency.toUpperCase()) {
    case 'DAILY':
      next.setDate(next.getDate() + interval);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * interval);
      break;
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14 * interval);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      // Unknown frequency — treat as a no-op so we don't spawn garbage.
      return null;
  }

  // If the parent's dueAt was so far in the past that even the bumped date is
  // still behind today, fast-forward to the next occurrence in the future.
  while (next.getTime() <= now) {
    switch (recurrence.frequency.toUpperCase()) {
      case 'DAILY':
        next.setDate(next.getDate() + interval);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + 7 * interval);
        break;
      case 'BIWEEKLY':
        next.setDate(next.getDate() + 14 * interval);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + interval);
        break;
    }
  }

  if (recurrence.until && next.getTime() > recurrence.until.getTime()) {
    return null;
  }

  return next;
}

/**
 * Spawn the next instance of a recurring task. Called when a task with a
 * `recurrenceId` transitions to status `DONE`. Best-effort: returns the
 * new task on success, null when no instance was spawned (chain exhausted,
 * task isn't recurring, etc.). Never throws — failures are logged.
 *
 * The new task copies title, description, priority, labels, and assignees
 * from the parent. It links to the SAME `TaskRecurrence` row, so editing
 * the recurrence config later affects all future generations.
 */
export async function spawnNextInstance(taskId: number): Promise<Task | null> {
  try {
    const parent = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        recurrence: true,
        assignments: { select: { userId: true } },
      },
    });

    if (!parent) {
      logger.warn('spawnNextInstance: task not found', { taskId });
      return null;
    }
    if (!parent.recurrence) {
      return null;
    }

    const nextDueAt = computeNextDueAt(parent.dueAt, parent.recurrence);
    if (!nextDueAt) {
      logger.info('Recurrence chain exhausted — no next instance spawned', {
        taskId,
        recurrenceId: parent.recurrenceId,
      });
      return null;
    }

    // Avoid duplicate spawns: if an OPEN task already exists for this
    // recurrence with dueAt >= nextDueAt, the chain has already advanced.
    const existing = await prisma.task.findFirst({
      where: {
        recurrenceId: parent.recurrenceId,
        deletedAt: null,
        status: { not: 'DONE' },
        id: { not: parent.id },
      },
      orderBy: { dueAt: 'desc' },
    });
    if (existing) {
      logger.info('Recurrence chain already has an open successor — skipping spawn', {
        taskId,
        existingId: existing.id,
      });
      return existing;
    }

    const created = await prisma.task.create({
      data: {
        title: parent.title,
        description: parent.description,
        dueAt: nextDueAt,
        priority: parent.priority,
        status: 'OPEN',
        labels: parent.labels,
        recurrenceId: parent.recurrenceId,
      },
    });

    if (parent.assignments.length > 0) {
      await prisma.taskAssignment.createMany({
        data: parent.assignments.map((a) => ({
          taskId: created.id,
          userId: a.userId,
          status: 'OPEN',
        })),
      });
    }

    logger.info('Spawned next recurring task instance', {
      parentId: parent.id,
      newId: created.id,
      nextDueAt: nextDueAt.toISOString(),
    });

    return created;
  } catch (err) {
    logger.error('Failed to spawn recurring task instance', {
      taskId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
