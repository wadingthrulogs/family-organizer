import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { Reminder } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

function projectReminder(r: Reminder) {
  return {
    id: r.id,
    title: r.title,
    targetType: r.targetType,
    targetId: r.targetId,
    leadTimeMinutes: r.leadTimeMinutes,
    channelMask: r.channelMask,
    enabled: r.enabled,
  };
}

export function registerReminderTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_reminders',
    'List reminders. Optionally filter by enabled flag.',
    { enabled: z.boolean().optional() },
    async (args) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.enabled !== undefined) params.enabled = args.enabled;
        const items = await ctx.api.get<Reminder[]>('/reminders', params);
        return ok({ items: items.map(projectReminder), total: items.length });
      } catch (err) {
        return fail(`list_reminders failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'create_reminder',
    'Create a reminder. channelMask defaults to 1 (push only); 2=email, 4=webhook (combine via bitwise OR).',
    {
      title: z.string().min(1).max(200),
      message: z.string().max(2000).optional(),
      targetType: z.string().min(1).max(40).describe('e.g. TASK, CHORE, GROCERY_ITEM, EVENT, NOTE'),
      targetId: z.number().int().positive().optional(),
      leadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
      channelMask: z.number().int().min(1).max(7).optional(),
      enabled: z.boolean().optional(),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          title: args.title,
          targetType: args.targetType,
          channelMask: args.channelMask ?? 1,
          enabled: args.enabled ?? true,
        };
        if (args.message) body.message = args.message;
        if (args.targetId !== undefined) body.targetId = args.targetId;
        if (args.leadTimeMinutes !== undefined) body.leadTimeMinutes = args.leadTimeMinutes;
        const created = await ctx.api.post<Reminder>('/reminders', body);
        return ok(projectReminder(created));
      } catch (err) {
        return fail(`create_reminder failed: ${describeError(err)}`);
      }
    },
  );
}
