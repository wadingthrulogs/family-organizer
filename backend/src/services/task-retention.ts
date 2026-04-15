import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

export interface RetentionThresholds {
  archiveDays: number;
  hardDeleteDays: number;
}

export interface RetentionResult {
  archived: number;
  hardDeleted: number;
  orphanRecurrencesDeleted: number;
  thresholds: RetentionThresholds;
  dryRun: boolean;
  error?: string;
}

const DEFAULT_THRESHOLDS: RetentionThresholds = {
  archiveDays: 30,
  hardDeleteDays: 90,
};

const SETTING_KEY = 'taskRetention';

export async function loadRetentionThresholds(): Promise<RetentionThresholds> {
  const row = await prisma.householdSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULT_THRESHOLDS;
  try {
    const parsed = JSON.parse(row.value) as Partial<RetentionThresholds>;
    const archiveDays = Number.isFinite(parsed.archiveDays) ? Number(parsed.archiveDays) : DEFAULT_THRESHOLDS.archiveDays;
    const hardDeleteDays = Number.isFinite(parsed.hardDeleteDays) ? Number(parsed.hardDeleteDays) : DEFAULT_THRESHOLDS.hardDeleteDays;
    return { archiveDays, hardDeleteDays };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Two-stage cleanup of completed tasks:
 *   1. DONE tasks with updatedAt older than archiveDays get soft-deleted (deletedAt = now()).
 *   2. Soft-deleted tasks with deletedAt older than hardDeleteDays get hard-deleted.
 *      Cascade FKs already wipe TaskAssignment + TaskStatusChange rows.
 *   3. Orphan TaskRecurrence rows (no parent task) are pruned.
 *
 * Recurring tasks are skipped at stage 1 if their recurrence is still active —
 * a DONE instance of an ongoing recurring chain stays around until the chain is
 * itself finished (until is past, or count is exhausted).
 */
export async function runTaskRetention(opts: { dryRun?: boolean } = {}): Promise<RetentionResult> {
  const dryRun = Boolean(opts.dryRun);
  const thresholds = await loadRetentionThresholds();
  const now = Date.now();
  const archiveCutoff = new Date(now - thresholds.archiveDays * 86_400_000);
  const hardCutoff = new Date(now - thresholds.hardDeleteDays * 86_400_000);

  const result: RetentionResult = {
    archived: 0,
    hardDeleted: 0,
    orphanRecurrencesDeleted: 0,
    thresholds,
    dryRun,
  };

  try {
    // ─── Stage 1: identify DONE tasks eligible for archiving ───
    const archiveCandidates = await prisma.task.findMany({
      where: {
        status: 'DONE',
        deletedAt: null,
        updatedAt: { lt: archiveCutoff },
      },
      select: {
        id: true,
        recurrenceId: true,
        recurrence: { select: { until: true, count: true } },
      },
    });

    // For recurring DONE tasks, find which recurrence chains have a
    // newer non-DONE instance. Those completed instances are SAFE to
    // archive — they're history of an ongoing chain. Recurring tasks
    // with no successor are kept until either a successor appears or
    // the chain hits its `until`.
    const recurringIds = archiveCandidates
      .map((t) => t.recurrenceId)
      .filter((id): id is number => id !== null);
    const successorRows = recurringIds.length
      ? await prisma.task.findMany({
          where: {
            recurrenceId: { in: recurringIds },
            deletedAt: null,
            status: { not: 'DONE' },
          },
          select: { recurrenceId: true },
        })
      : [];
    const recurrencesWithSuccessor = new Set(
      successorRows.map((r) => r.recurrenceId).filter((id): id is number => id !== null),
    );

    const recurrenceChainExpired = (rec: { until: Date | null } | null) => {
      if (!rec) return true;
      if (rec.until === null) return false;
      return rec.until.getTime() <= now;
    };

    const archiveIds = archiveCandidates
      .filter((t) => {
        // Non-recurring tasks always archive.
        if (t.recurrenceId === null) return true;
        // Recurring task whose chain has expired: archive.
        if (recurrenceChainExpired(t.recurrence)) return true;
        // Recurring task whose chain has spawned a successor: archive history.
        if (recurrencesWithSuccessor.has(t.recurrenceId)) return true;
        // Otherwise leave it — it's the latest instance of an ongoing chain.
        return false;
      })
      .map((t) => t.id);

    // ─── Stage 2: identify soft-deleted tasks eligible for hard delete ───
    const hardDeleteRows = await prisma.task.findMany({
      where: { deletedAt: { not: null, lt: hardCutoff } },
      select: { id: true },
    });
    const hardDeleteIds = hardDeleteRows.map((t) => t.id);

    // ─── Stage 3: identify orphan TaskRecurrence rows ───
    const orphanRows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM TaskRecurrence
      WHERE id NOT IN (SELECT recurrenceId FROM Task WHERE recurrenceId IS NOT NULL)
    `;
    const orphanRecurrenceIds = orphanRows.map((r) => r.id);

    result.archived = archiveIds.length;
    result.hardDeleted = hardDeleteIds.length;
    result.orphanRecurrencesDeleted = orphanRecurrenceIds.length;

    if (dryRun) {
      return result;
    }

    await prisma.$transaction(async (tx) => {
      if (archiveIds.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: archiveIds } },
          data: { deletedAt: new Date() },
        });
      }
      if (hardDeleteIds.length > 0) {
        await tx.task.deleteMany({ where: { id: { in: hardDeleteIds } } });
      }
      if (orphanRecurrenceIds.length > 0) {
        await tx.taskRecurrence.deleteMany({ where: { id: { in: orphanRecurrenceIds } } });
      }
    });

    // Audit log outside the transaction so a logging failure doesn't roll back the cleanup.
    await prisma.auditLog.create({
      data: {
        actionType: 'TASK_RETENTION_RUN',
        entityType: 'Task',
        payload: JSON.stringify(result),
      },
    }).catch((err) => logger.warn('Failed to write task retention audit log', { err: String(err) }));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Task retention failed', { err: message });
    return { ...result, error: message };
  }
}
