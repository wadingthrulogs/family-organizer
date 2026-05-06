import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type {
  CalendarEvent,
  Chore,
  GroceryList,
  InventoryItem,
  PaginatedChores,
  PaginatedTasks,
  Task,
} from '../client/types.js';
import { describeError } from '../util/errors.js';
import { todayBoundsInTimezone } from '../util/format.js';

import { fail, ok, type ToolContext } from './context.js';

const DEFAULT_TZ = 'America/New_York';

export function registerDashboardTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'get_today_summary',
    "Compound 'what's on my plate today' view. Returns events happening today, tasks due today, currently pending chores, low-stock inventory, and grocery items still needed.",
    {
      timezone: z.string().max(80).optional().describe('IANA timezone, default America/New_York'),
    },
    async (args) => {
      const tz = args.timezone ?? DEFAULT_TZ;
      const { start, end, isoDate } = todayBoundsInTimezone(tz);

      try {
        const [tasksPage, choresPage, events, inventory, lists, usernames] = await Promise.all([
          ctx.api.get<PaginatedTasks>('/tasks', { status: 'OPEN', limit: 50 }),
          ctx.api.get<PaginatedChores>('/chores', { active: true, includeAssignments: true }),
          ctx.api.get<CalendarEvent[]>('/calendar/events', { start, end }),
          ctx.api.get<InventoryItem[]>('/inventory', { lowStock: true }),
          ctx.api.get<{ items: GroceryList[] }>('/grocery/lists', {
            active: true,
            includeItems: true,
          }),
          ctx.users.usernameMap(),
        ]);

        const todayStart = Date.parse(start);
        const todayEnd = Date.parse(end);

        const tasksDueToday = tasksPage.items
          .filter((t: Task) => {
            if (!t.dueAt) return false;
            const due = Date.parse(t.dueAt);
            return due >= todayStart && due <= todayEnd;
          })
          .map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: t.dueAt,
            priority: t.priority,
            assignees:
              t.assignments?.map((a) => usernames.get(a.userId) ?? `user#${a.userId}`) ?? [],
          }));

        const pendingChores = choresPage.items.flatMap((c: Chore) => {
          const open = c.assignments?.find(
            (a) => a.state === 'PENDING' || a.state === 'IN_PROGRESS',
          );
          if (!open) return [];
          return [
            {
              choreId: c.id,
              title: c.title,
              assignmentId: open.id,
              assignee: open.userId
                ? usernames.get(open.userId) ?? `user#${open.userId}`
                : null,
              state: open.state,
              windowEnd: open.windowEnd,
            },
          ];
        });

        const eventsToday = events.map((e) => ({
          id: e.id,
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt,
          allDay: e.allDay,
          location: e.location,
        }));

        const lowInventory = inventory.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          lowStockThreshold: i.lowStockThreshold,
        }));

        const neededGroceries = lists.items
          .map((l) => ({
            listId: l.id,
            listName: l.name,
            items: (l.items ?? [])
              .filter((it) => it.state === 'NEEDED' || it.state === 'CLAIMED')
              .map((it) => ({
                id: it.id,
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                state: it.state,
              })),
          }))
          .filter((l) => l.items.length > 0);

        return ok({
          todayDate: isoDate,
          timezone: tz,
          eventsToday,
          tasksDueToday,
          pendingChores,
          lowInventory,
          neededGroceries,
        });
      } catch (err) {
        return fail(`get_today_summary failed: ${describeError(err)}`);
      }
    },
  );
}
