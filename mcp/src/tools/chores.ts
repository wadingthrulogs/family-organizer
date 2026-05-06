import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Chore, ChoreAssignment, PaginatedChores } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

const ASSIGNMENT_STATES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'SNOOZED',
  'SKIPPED',
] as const;

function projectChore(c: Chore, usernames: Map<number, string>) {
  const open = c.assignments?.find(
    (a) => a.state === 'PENDING' || a.state === 'IN_PROGRESS',
  );
  return {
    id: c.id,
    title: c.title,
    frequency: c.frequency,
    interval: c.interval,
    active: c.active,
    currentAssignment: open
      ? {
          id: open.id,
          assignee: open.userId ? usernames.get(open.userId) ?? `user#${open.userId}` : null,
          state: open.state,
          windowStart: open.windowStart,
          windowEnd: open.windowEnd,
        }
      : null,
  };
}

export function registerChoreTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_chores',
    'List active chores with their current pending/in-progress assignment (if any). Use update_chore_assignment to mark one done.',
    { active: z.boolean().optional() },
    async (args) => {
      try {
        const [page, usernames] = await Promise.all([
          ctx.api.get<PaginatedChores>('/chores', {
            active: args.active ?? true,
            includeAssignments: true,
          }),
          ctx.users.usernameMap(),
        ]);
        return ok({
          items: page.items.map((c) => projectChore(c, usernames)),
          total: page.total,
        });
      } catch (err) {
        return fail(`list_chores failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'update_chore_assignment',
    'Update a chore assignment\'s state (e.g., COMPLETED). The endpoint takes assignmentId only — no choreId in the path. Marking COMPLETED auto-generates the next assignment.',
    {
      assignmentId: z.number().int().positive(),
      state: z.enum(ASSIGNMENT_STATES),
      notes: z.string().max(2000).optional(),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = { state: args.state };
        if (args.notes !== undefined) body.notes = args.notes;
        const updated = await ctx.api.patch<ChoreAssignment>(
          `/chores/assignments/${args.assignmentId}`,
          body,
        );
        return ok({
          id: updated.id,
          state: updated.state,
          completedAt: updated.completedAt,
          notes: updated.notes,
        });
      } catch (err) {
        return fail(`update_chore_assignment failed: ${describeError(err)}`);
      }
    },
  );
}
