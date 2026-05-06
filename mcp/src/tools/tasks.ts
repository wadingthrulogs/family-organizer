import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { PaginatedTasks, Task, TaskStatus } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'ARCHIVED'] as const;

function projectTask(t: Task, usernames: Map<number, string>) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt,
    assignees:
      t.assignments?.map((a) => usernames.get(a.userId) ?? `user#${a.userId}`) ?? [],
  };
}

export function registerTaskTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_tasks',
    'List household tasks. Defaults to OPEN tasks. Returns lean items: id, title, status, priority, dueAt, assignees.',
    {
      status: z.enum(TASK_STATUSES).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      cursor: z.number().int().optional(),
    },
    async (args) => {
      try {
        const params: Record<string, unknown> = {};
        params.status = args.status ?? 'OPEN';
        if (args.limit !== undefined) params.limit = args.limit;
        if (args.cursor !== undefined) params.cursor = args.cursor;
        const [page, usernames] = await Promise.all([
          ctx.api.get<PaginatedTasks>('/tasks', params),
          ctx.users.usernameMap(),
        ]);
        return ok({
          items: page.items.map((t) => projectTask(t, usernames)),
          total: page.total,
          nextCursor: page.nextCursor,
        });
      } catch (err) {
        return fail(`list_tasks failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'create_task',
    'Create a new task. Defaults: priority=0, status=OPEN. Resolve assignees by username; the bot itself is excluded if you do not list it.',
    {
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      dueAt: z.string().datetime().optional().describe('ISO-8601 datetime'),
      priority: z.number().int().min(0).max(5).optional(),
      assigneeUsernames: z.array(z.string().min(1)).optional(),
    },
    async (args) => {
      try {
        const assigneeUserIds = args.assigneeUsernames
          ? await ctx.users.resolveUsernames(args.assigneeUsernames)
          : undefined;
        const body: Record<string, unknown> = {
          title: args.title,
          priority: args.priority ?? 0,
          status: 'OPEN',
        };
        if (args.description) body.description = args.description;
        if (args.dueAt) body.dueAt = args.dueAt;
        if (assigneeUserIds) body.assigneeUserIds = assigneeUserIds;
        const created = await ctx.api.post<Task>('/tasks', body);
        const usernames = await ctx.users.usernameMap();
        return ok(projectTask(created, usernames));
      } catch (err) {
        return fail(`create_task failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'update_task',
    'Update a task\'s status and/or assignees. Title/description edits are intentionally not supported in this version.',
    {
      taskId: z.number().int().positive(),
      status: z.enum(TASK_STATUSES).optional(),
      assigneeUsernames: z.array(z.string().min(1)).optional(),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {};
        if (args.status) body.status = args.status;
        if (args.assigneeUsernames) {
          body.assigneeUserIds = await ctx.users.resolveUsernames(args.assigneeUsernames);
        }
        if (Object.keys(body).length === 0) return fail('No updates supplied.');
        const updated = await ctx.api.patch<Task>(`/tasks/${args.taskId}`, body);
        const usernames = await ctx.users.usernameMap();
        return ok(projectTask(updated, usernames));
      } catch (err) {
        return fail(`update_task failed: ${describeError(err)}`);
      }
    },
  );
}

export type { TaskStatus };
