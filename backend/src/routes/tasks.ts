import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { prisma } from '../lib/prisma.js';
import { runTaskRetention } from '../services/task-retention.js';
import { asyncHandler } from '../utils/async-handler.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const cleanupBodySchema = z.object({
  dryRun: z.boolean().optional(),
});

/* ─── Admin: manual retention cleanup ─── */
// Note: defined BEFORE the /:taskId routes so 'cleanup' isn't parsed as a taskId.
tasksRouter.post(
  '/cleanup',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { dryRun } = cleanupBodySchema.parse(req.body ?? {});
    const result = await runTaskRetention({ dryRun });
    if (result.error) {
      return res.status(500).json({ error: { code: 'RETENTION_FAILED', message: result.error } });
    }
    res.json({ data: result });
  })
);

const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'ARCHIVED'] as const;
const taskStatusSchema = z.enum(TASK_STATUSES);

const listQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: z.coerce.number().int().min(0).max(5).default(0),
  status: taskStatusSchema.default('OPEN'),
  labels: z.string().trim().max(500).nullable().optional(),
  assigneeUserIds: z.array(z.coerce.number().int().positive()).optional(),
  recurrence: z.object({
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.coerce.number().int().min(1).max(365).default(1),
    byDay: z.string().nullable().optional(),
    byMonthDay: z.string().nullable().optional(),
    until: z.string().datetime().nullable().optional(),
    count: z.coerce.number().int().positive().nullable().optional(),
  }).nullable().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: z.coerce.number().int().min(0).max(5).optional(),
  status: taskStatusSchema.optional(),
  labels: z.string().trim().max(500).nullable().optional(),
  assigneeUserIds: z.array(z.coerce.number().int().positive()).optional(),
});

const taskIdParamsSchema = z.object({
  taskId: z.coerce.number().int().positive(),
});

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, cursor, limit } = listQuerySchema.parse(req.query);
    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
    };
    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { recurrence: true, assignments: { include: { user: { select: { id: true, username: true, colorHex: true } } } } },
    });

    const total = await prisma.task.count({ where });
    const nextCursor = tasks.length === limit ? tasks[tasks.length - 1]?.id ?? null : null;

    res.json({ items: tasks, total, nextCursor });
  })
);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = createTaskSchema.parse(req.body ?? {});

    // Create recurrence record if provided
    let recurrenceId: number | null = null;
    if (payload.recurrence) {
      const rec = await prisma.taskRecurrence.create({
        data: {
          frequency: payload.recurrence.frequency,
          interval: payload.recurrence.interval,
          byDay: payload.recurrence.byDay ?? null,
          byMonthDay: payload.recurrence.byMonthDay ?? null,
          until: payload.recurrence.until ? new Date(payload.recurrence.until) : null,
          count: payload.recurrence.count ?? null,
        },
      });
      recurrenceId = rec.id;
    }

    const task = await prisma.task.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
        priority: payload.priority,
        status: payload.status,
        labels: payload.labels ?? null,
        recurrenceId,
      },
      include: { recurrence: true, assignments: { include: { user: { select: { id: true, username: true, colorHex: true } } } } },
    });

    // Create assignments if provided
    if (payload.assigneeUserIds?.length) {
      await prisma.taskAssignment.createMany({
        data: payload.assigneeUserIds.map((userId) => ({
          taskId: task.id,
          userId,
          status: 'OPEN',
        })),
      });
    }

    // Re-fetch with assignments
    const full = await prisma.task.findUnique({
      where: { id: task.id },
      include: { recurrence: true, assignments: { include: { user: { select: { id: true, username: true, colorHex: true } } } } },
    });

    res.status(201).json(full);
  })
);

tasksRouter.get(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { recurrence: true, assignments: { include: { user: { select: { id: true, username: true, colorHex: true } } } } },
    });

    if (!task || task.deletedAt) {
      return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
    }

    res.json(task);
  })
);

tasksRouter.patch(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const { taskId } = taskIdParamsSchema.parse(req.params);
    const payload = updateTaskSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'Provide at least one field to update' } });
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.deletedAt) {
      return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
    }

    const data: Prisma.TaskUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.priority !== undefined) data.priority = payload.priority;
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.labels !== undefined) data.labels = payload.labels ?? null;
    if (payload.dueAt !== undefined) {
      data.dueAt = payload.dueAt ? new Date(payload.dueAt) : null;
    }

    await prisma.task.update({ where: { id: taskId }, data });

    // Log status change to audit history
    if (payload.status !== undefined && payload.status !== task.status) {
      const userId = req.session.userId ?? null;
      await prisma.taskStatusChange.create({
        data: {
          taskId,
          fromStatus: task.status,
          toStatus: payload.status,
          changedBy: userId,
        },
      });
    }

    // Sync assignments when provided
    if (payload.assigneeUserIds !== undefined) {
      await prisma.taskAssignment.deleteMany({ where: { taskId } });
      if (payload.assigneeUserIds.length > 0) {
        await prisma.taskAssignment.createMany({
          data: payload.assigneeUserIds.map((userId) => ({ taskId, userId, status: 'OPEN' })),
        });
      }
    }

    const updated = await prisma.task.findUnique({
      where: { id: taskId },
      include: { recurrence: true, assignments: { include: { user: { select: { id: true, username: true, colorHex: true } } } } },
    });

    res.json(updated);
  })
);

tasksRouter.delete(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const { taskId } = taskIdParamsSchema.parse(req.params);

    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.deletedAt) {
      return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    res.status(204).send();
  })
);

/* ─── Task Status History (audit log) ─── */
tasksRouter.get(
  '/:taskId/history',
  asyncHandler(async (req, res) => {
    const { taskId } = taskIdParamsSchema.parse(req.params);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) {
      return res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Task not found' } });
    }

    const history = await prisma.taskStatusChange.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        changer: { select: { id: true, username: true } },
      },
    });

    res.json({ taskId, history });
  })
);
