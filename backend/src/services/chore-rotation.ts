import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Chore Rotation Engine
 * ---------------------
 * Generates the next ChoreAssignment for a given chore based on its rotationType.
 *
 * Strategies:
 *   ROUND_ROBIN – cycles through eligibleUserIds in order, wrapping at end.
 *   WEIGHTED    – picks the eligible user with the fewest completed assignments.
 *   MANUAL      – no auto-generation; admins create assignments manually.
 */

interface WindowConfig {
  /** Start of the assignment window (defaults to now) */
  windowStart?: Date;
  /** End of the assignment window (calculated from frequency/interval if omitted) */
  windowEnd?: Date;
}

/**
 * Compute the window end from a chore's frequency and interval, starting from `start`.
 */
function computeWindowEnd(frequency: string, interval: number, start: Date): Date {
  const end = new Date(start);
  const freq = frequency.toUpperCase();

  switch (freq) {
    case 'DAILY':
      end.setDate(end.getDate() + interval);
      break;
    case 'WEEKLY':
      end.setDate(end.getDate() + 7 * interval);
      break;
    case 'BIWEEKLY':
      end.setDate(end.getDate() + 14 * interval);
      break;
    case 'MONTHLY':
      end.setMonth(end.getMonth() + interval);
      break;
    default:
      // fallback: treat as daily
      end.setDate(end.getDate() + interval);
      break;
  }

  return end;
}

/**
 * Pick the next userId for ROUND_ROBIN rotation.
 * Looks at the most recent assignment for this chore and advances to the next user.
 */
async function pickRoundRobin(choreId: number, eligibleUserIds: number[]): Promise<number> {
  if (eligibleUserIds.length === 1) return eligibleUserIds[0];

  const lastAssignment = await prisma.choreAssignment.findFirst({
    where: { choreId, userId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, rotationOrder: true },
  });

  if (!lastAssignment?.userId) {
    return eligibleUserIds[0];
  }

  const lastIndex = eligibleUserIds.indexOf(lastAssignment.userId);
  const nextIndex = (lastIndex + 1) % eligibleUserIds.length;
  return eligibleUserIds[nextIndex];
}

/**
 * Pick the next userId for WEIGHTED rotation.
 * Assigns to the eligible user with the fewest completed assignments for this chore.
 * If there's a weightMap, it applies as a divisor (higher weight = more assignments expected).
 */
async function pickWeighted(
  choreId: number,
  eligibleUserIds: number[],
  weightMap: Record<string, number> | null,
): Promise<number> {
  if (eligibleUserIds.length === 1) return eligibleUserIds[0];

  // Count completed assignments per eligible user for this chore
  const completedCounts = await prisma.choreAssignment.groupBy({
    by: ['userId'],
    where: {
      choreId,
      state: 'COMPLETED',
      userId: { in: eligibleUserIds },
    },
    _count: { id: true },
  });

  const countMap = new Map<number, number>();
  for (const row of completedCounts) {
    if (row.userId != null) {
      countMap.set(row.userId, row._count.id);
    }
  }

  // Score each user: lower is better (they deserve the next assignment)
  let bestUserId = eligibleUserIds[0];
  let bestScore = Infinity;

  for (const uid of eligibleUserIds) {
    const count = countMap.get(uid) ?? 0;
    const weight = weightMap?.[String(uid)] ?? 1;
    // Effective score: completions / weight. Lower means "has done less relative to their share"
    const score = count / Math.max(weight, 0.01);
    if (score < bestScore) {
      bestScore = score;
      bestUserId = uid;
    }
  }

  return bestUserId;
}

/**
 * Generate the next assignment for a chore.
 * Returns the created ChoreAssignment or null if the chore is manual / inactive.
 */
export async function generateNextAssignment(choreId: number, windowConfig?: WindowConfig) {
  const chore = await prisma.chore.findUnique({ where: { id: choreId } });
  if (!chore || !chore.active) {
    logger.warn('Skipping assignment generation for inactive/missing chore', { choreId });
    return null;
  }

  if (chore.rotationType === 'MANUAL') {
    logger.info('Chore uses MANUAL rotation, skipping auto-generation', { choreId });
    return null;
  }

  const eligibleUserIds = chore.eligibleUserIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10));

  if (eligibleUserIds.length === 0) {
    logger.warn('No eligible users for chore', { choreId });
    return null;
  }

  // Validate that eligible users actually exist in the database
  const existingUsers = await prisma.user.findMany({
    where: { id: { in: eligibleUserIds }, deletedAt: null },
    select: { id: true },
  });
  const validUserIds = existingUsers.map((u) => u.id);

  if (validUserIds.length === 0) {
    logger.warn('None of the eligible users exist for chore', { choreId, eligibleUserIds });
    return null;
  }

  // Check if there's already a pending/in-progress assignment for this chore
  const openAssignment = await prisma.choreAssignment.findFirst({
    where: {
      choreId,
      state: { in: ['PENDING', 'IN_PROGRESS'] },
    },
  });

  if (openAssignment) {
    logger.info('Chore already has an open assignment, skipping', { choreId, assignmentId: openAssignment.id });
    return openAssignment;
  }

  // Pick next user
  const weightMap = chore.weightMapJson ? (JSON.parse(chore.weightMapJson) as Record<string, number>) : null;

  let userId: number;
  if (chore.rotationType === 'ROUND_ROBIN') {
    userId = await pickRoundRobin(choreId, validUserIds);
  } else {
    userId = await pickWeighted(choreId, validUserIds, weightMap);
  }

  const windowStart = windowConfig?.windowStart ?? new Date();
  const windowEnd = windowConfig?.windowEnd ?? computeWindowEnd(chore.frequency, chore.interval, windowStart);

  // Determine rotation order
  const lastOrder = await prisma.choreAssignment.findFirst({
    where: { choreId },
    orderBy: { rotationOrder: 'desc' },
    select: { rotationOrder: true },
  });

  const rotationOrder = (lastOrder?.rotationOrder ?? 0) + 1;

  const assignment = await prisma.choreAssignment.create({
    data: {
      choreId,
      userId,
      windowStart,
      windowEnd,
      state: 'PENDING',
      rotationOrder,
    },
    include: {
      assignee: { select: { id: true, username: true, colorHex: true } },
    },
  });

  logger.info('Generated chore assignment', {
    choreId,
    assignmentId: assignment.id,
    userId,
    rotationType: chore.rotationType,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  return assignment;
}

/**
 * Generate next assignments for ALL active, non-manual chores
 * that don't have an open (PENDING/IN_PROGRESS) assignment.
 * Returns the number of assignments created.
 */
export async function generateAllPendingAssignments(): Promise<number> {
  const chores = await prisma.chore.findMany({
    where: {
      active: true,
      rotationType: { not: 'MANUAL' },
    },
  });

  let created = 0;
  for (const chore of chores) {
    const result = await generateNextAssignment(chore.id);
    if (result) created++;
  }

  return created;
}
