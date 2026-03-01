import { Chore, Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { generateNextAssignment, generateAllPendingAssignments } from '../services/chore-rotation.js';
import { asyncHandler } from '../utils/async-handler.js';

export const choresRouter = Router();
choresRouter.use(requireAuth);

const ROTATION_TYPES = ['ROUND_ROBIN', 'WEIGHTED', 'MANUAL'] as const;
const ASSIGNMENT_STATES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SNOOZED', 'SKIPPED'] as const;

const listQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  includeAssignments: z.coerce.boolean().optional(),
});

const createChoreSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  rotationType: z.enum(ROTATION_TYPES).default('ROUND_ROBIN'),
  frequency: z.string().trim().min(1).max(50),
  interval: z.coerce.number().int().min(1).max(30).default(1),
  eligibleUserIds: z.array(z.coerce.number().int().positive()).min(1),
  weightMap: z.record(z.coerce.number().int().positive()).nullable().optional(),
  rewardPoints: z.coerce.number().int().min(0).max(100).default(0),
  active: z.coerce.boolean().default(true),
});

const updateChoreSchema = createChoreSchema.partial();

const choreIdParamsSchema = z.object({
  choreId: z.coerce.number().int().positive(),
});

const assignmentIdSchema = z.object({
  assignmentId: z.coerce.number().int().positive(),
});

const updateAssignmentSchema = z.object({
  state: z.enum(ASSIGNMENT_STATES).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const assigneeSelect = {
  id: true,
  username: true,
  colorHex: true,
} as const;

type ChoreWithAssignments = Prisma.ChoreGetPayload<{
  include: { assignments: { include: { assignee: { select: typeof assigneeSelect } } } };
}>;

function deserializeChore(chore: ChoreWithAssignments | Chore) {
  const { weightMapJson, eligibleUserIds, assignments, ...rest } = chore as ChoreWithAssignments;

  const base = {
    ...rest,
    weightMap: weightMapJson ? JSON.parse(weightMapJson) : null,
    eligibleUserIds: eligibleUserIds
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => Number.parseInt(value, 10)),
  };

  if (!assignments) {
    return base;
  }

  return {
    ...base,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      assignee: assignment.assignee
        ? {
            id: assignment.assignee.id,
            username: assignment.assignee.username,
            colorHex: assignment.assignee.colorHex,
          }
        : null,
    })),
  };
}

choresRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { active, includeAssignments } = listQuerySchema.parse(req.query);
    const where = typeof active === 'boolean' ? { active } : undefined;
    const include: Prisma.ChoreInclude | undefined = includeAssignments
      ? { assignments: { orderBy: { windowStart: 'desc' as const }, include: { assignee: { select: assigneeSelect } } } }
      : undefined;

    const [items, total] = await Promise.all([
      prisma.chore.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.chore.count({ where }),
    ]);

    res.json({
      items: items.map(deserializeChore),
      total,
    });
  })
);

choresRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = createChoreSchema.parse(req.body ?? {});

    const chore = await prisma.chore.create({
      data: {
        title: payload.title,
        description: payload.description ?? null,
        rotationType: payload.rotationType,
        frequency: payload.frequency,
        interval: payload.interval,
        eligibleUserIds: payload.eligibleUserIds.join(','),
        weightMapJson: payload.weightMap ? JSON.stringify(payload.weightMap) : null,
        rewardPoints: payload.rewardPoints,
        active: payload.active,
      },
    });

    // Auto-generate the first assignment for non-manual chores
    if (chore.rotationType !== 'MANUAL' && chore.active) {
      await generateNextAssignment(chore.id);
    }

    // Re-fetch with assignments included
    const choreWithAssignments = await prisma.chore.findUnique({
      where: { id: chore.id },
      include: { assignments: { orderBy: { windowStart: 'desc' as const }, include: { assignee: { select: assigneeSelect } } } },
    });

    res.status(201).json(deserializeChore(choreWithAssignments ?? chore));
  })
);

choresRouter.get(
  '/:choreId',
  asyncHandler(async (req, res) => {
    const { choreId } = choreIdParamsSchema.parse(req.params);

    const chore = await prisma.chore.findUnique({ where: { id: choreId } });

    if (!chore) {
      return res.status(404).json({ error: { code: 'CHORE_NOT_FOUND', message: 'Chore not found' } });
    }

    res.json(deserializeChore(chore));
  })
);

choresRouter.patch(
  '/:choreId',
  asyncHandler(async (req, res) => {
    const { choreId } = choreIdParamsSchema.parse(req.params);
    const payload = updateChoreSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const chore = await prisma.chore.findUnique({ where: { id: choreId } });

    if (!chore) {
      return res.status(404).json({ error: { code: 'CHORE_NOT_FOUND', message: 'Chore not found' } });
    }

    const data: Prisma.ChoreUpdateInput = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description ?? null;
    if (payload.rotationType !== undefined) data.rotationType = payload.rotationType;
    if (payload.frequency !== undefined) data.frequency = payload.frequency;
    if (payload.interval !== undefined) data.interval = payload.interval;
    if (payload.rewardPoints !== undefined) data.rewardPoints = payload.rewardPoints;
    if (payload.active !== undefined) data.active = payload.active;
    if (payload.eligibleUserIds !== undefined) {
      data.eligibleUserIds = payload.eligibleUserIds.join(',');
    }
    if (payload.weightMap !== undefined) {
      data.weightMapJson = payload.weightMap ? JSON.stringify(payload.weightMap) : null;
    }

    const updated = await prisma.chore.update({ where: { id: choreId }, data });
    res.json(deserializeChore(updated));
  })
);

choresRouter.patch(
  '/assignments/:assignmentId',
  asyncHandler(async (req, res) => {
    const { assignmentId } = assignmentIdSchema.parse(req.params);
    const payload = updateAssignmentSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    const data: Prisma.ChoreAssignmentUpdateInput = {};
    if (payload.state !== undefined) {
      data.state = payload.state;
      data.completedAt = payload.state === 'COMPLETED' ? new Date() : null;
    }
    if (payload.notes !== undefined) {
      data.notes = payload.notes ?? null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    try {
      const assignment = await prisma.choreAssignment.update({ where: { id: assignmentId }, data });

      // When a chore assignment is completed, auto-generate the next one
      if (payload.state === 'COMPLETED') {
        await generateNextAssignment(assignment.choreId);
      }

      res.json(assignment);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found' } });
      }
      throw err;
    }
  })
);

/* ─── Rotation endpoints ─── */

/** Generate the next assignment for a specific chore */
choresRouter.post(
  '/:choreId/generate',
  asyncHandler(async (req, res) => {
    const { choreId } = choreIdParamsSchema.parse(req.params);
    const assignment = await generateNextAssignment(choreId);

    if (!assignment) {
      return res.status(422).json({ error: { code: 'GENERATION_SKIPPED', message: 'No assignment generated (chore may be manual, inactive, or already has an open assignment)' } });
    }

    res.status(201).json(assignment);
  })
);

/** Generate next assignments for ALL eligible chores */
choresRouter.post(
  '/generate-all',
  asyncHandler(async (_req, res) => {
    const created = await generateAllPendingAssignments();
    res.json({ generated: created });
  })
);

/* ─── Skip: mark an assignment as SKIPPED and auto-generate next ─── */
choresRouter.post(
  '/assignments/:assignmentId/skip',
  asyncHandler(async (req, res) => {
    const { assignmentId } = assignmentIdSchema.parse(req.params);
    const body = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});

    const assignment = await prisma.choreAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) {
      return res.status(404).json({ error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found' } });
    }
    if (assignment.state === 'COMPLETED' || assignment.state === 'SKIPPED') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: `Cannot skip a ${assignment.state} assignment` } });
    }

    const updated = await prisma.choreAssignment.update({
      where: { id: assignmentId },
      data: { state: 'SKIPPED', notes: body.reason ?? 'Skipped' },
    });

    // Auto-generate next assignment
    await generateNextAssignment(assignment.choreId);

    res.json(updated);
  })
);

/* ─── Swap: trade an assignment with another eligible user ─── */
choresRouter.post(
  '/assignments/:assignmentId/swap',
  asyncHandler(async (req, res) => {
    const { assignmentId } = assignmentIdSchema.parse(req.params);
    const body = z.object({ targetUserId: z.coerce.number().int().positive() }).parse(req.body ?? {});

    const assignment = await prisma.choreAssignment.findUnique({
      where: { id: assignmentId },
      include: { chore: true },
    });
    if (!assignment) {
      return res.status(404).json({ error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found' } });
    }
    if (assignment.state === 'COMPLETED' || assignment.state === 'SKIPPED') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: `Cannot swap a ${assignment.state} assignment` } });
    }

    // Verify target user is eligible
    const eligible = assignment.chore.eligibleUserIds.split(',').map(Number);
    if (!eligible.includes(body.targetUserId)) {
      return res.status(400).json({ error: { code: 'USER_NOT_ELIGIBLE', message: 'Target user is not eligible for this chore' } });
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: body.targetUserId, deletedAt: null } });
    if (!targetUser) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Target user not found' } });
    }

    const updated = await prisma.choreAssignment.update({
      where: { id: assignmentId },
      data: {
        userId: body.targetUserId,
        notes: `Swapped from user ${assignment.userId ?? 'unassigned'} to ${targetUser.username}`,
      },
      include: { assignee: { select: assigneeSelect } },
    });

    res.json(updated);
  })
);

/* ─── Completion streaks per user per chore ─── */
choresRouter.get(
  '/:choreId/streaks',
  asyncHandler(async (req, res) => {
    const { choreId } = choreIdParamsSchema.parse(req.params);

    const chore = await prisma.chore.findUnique({ where: { id: choreId } });
    if (!chore) {
      return res.status(404).json({ error: { code: 'CHORE_NOT_FOUND', message: 'Chore not found' } });
    }

    const eligibleUserIds = chore.eligibleUserIds.split(',').map(Number);

    const streaks: Array<{ userId: number; username: string; currentStreak: number; longestStreak: number; totalCompleted: number }> = [];

    for (const userId of eligibleUserIds) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
      if (!user) continue;

      // Get all assignments for this user+chore ordered by window
      const assignments = await prisma.choreAssignment.findMany({
        where: { choreId, userId },
        orderBy: { windowStart: 'asc' },
        select: { state: true },
      });

      let currentStreak = 0;
      let longestStreak = 0;
      let runningStreak = 0;
      let totalCompleted = 0;

      for (const a of assignments) {
        if (a.state === 'COMPLETED') {
          runningStreak++;
          totalCompleted++;
          if (runningStreak > longestStreak) longestStreak = runningStreak;
        } else {
          runningStreak = 0;
        }
      }
      currentStreak = runningStreak;

      streaks.push({ userId: user.id, username: user.username, currentStreak, longestStreak, totalCompleted });
    }

    res.json({ choreId, streaks });
  })
);

choresRouter.delete(
  '/:choreId',
  asyncHandler(async (req, res) => {
    const { choreId } = choreIdParamsSchema.parse(req.params);

    try {
      await prisma.chore.delete({ where: { id: choreId } });
      res.status(204).send();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return res.status(404).json({ error: { code: 'CHORE_NOT_FOUND', message: 'Chore not found' } });
      }
      throw err;
    }
  })
);
