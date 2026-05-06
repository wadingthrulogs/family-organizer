import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { CalendarEvent, LinkedCalendar } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

function projectEvent(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    linkedCalendar: e.linkedCalendar
      ? { id: e.linkedCalendar.id, displayName: e.linkedCalendar.displayName }
      : null,
  };
}

export function registerCalendarTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_calendars',
    'List linked Google calendars (and any locally-tracked ones) the bot user has access to. Use the returned id when ambiguous in create_calendar_event.',
    {},
    async () => {
      try {
        const items = await ctx.api.get<LinkedCalendar[]>('/calendar/calendars');
        return ok({
          items: items.map((c) => ({
            id: c.id,
            displayName: c.displayName,
            googleAccountEmail: c.googleAccountEmail ?? null,
          })),
        });
      } catch (err) {
        return fail(`list_calendars failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'list_calendar_events',
    'List calendar events in a date range. Both `start` and `end` are ISO-8601 datetimes (UTC). Optional calendarId filters by a single linked calendar.',
    {
      start: z.string().datetime(),
      end: z.string().datetime(),
      calendarId: z.number().int().positive().optional(),
    },
    async (args) => {
      try {
        const params: Record<string, unknown> = { start: args.start, end: args.end };
        if (args.calendarId !== undefined) params.calendarId = args.calendarId;
        const items = await ctx.api.get<CalendarEvent[]>('/calendar/events', params);
        return ok({ items: items.map(projectEvent) });
      } catch (err) {
        return fail(`list_calendar_events failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'create_calendar_event',
    'Create a local (non-Google) calendar event. If linkedCalendarId is omitted and exactly one linked calendar exists, that one is used; if multiple exist, the tool errors with the list so you can pick. timezone defaults to America/New_York.',
    {
      title: z.string().min(1).max(300),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      timezone: z.string().max(80).optional(),
      allDay: z.boolean().optional(),
      description: z.string().max(2000).optional(),
      location: z.string().max(300).optional(),
      linkedCalendarId: z.number().int().positive().optional(),
    },
    async (args) => {
      try {
        let linkedCalendarId = args.linkedCalendarId;
        if (linkedCalendarId === undefined) {
          const calendars = await ctx.api.get<LinkedCalendar[]>('/calendar/calendars');
          if (calendars.length === 1) {
            linkedCalendarId = calendars[0]!.id;
          } else if (calendars.length > 1) {
            return fail(
              `Multiple linked calendars exist; pass linkedCalendarId. Choices: ${JSON.stringify(
                calendars.map((c) => ({ id: c.id, displayName: c.displayName })),
              )}`,
            );
          }
        }
        const body: Record<string, unknown> = {
          title: args.title,
          startAt: args.startAt,
          endAt: args.endAt,
          timezone: args.timezone ?? 'America/New_York',
        };
        if (linkedCalendarId !== undefined) body.linkedCalendarId = linkedCalendarId;
        if (args.allDay !== undefined) body.allDay = args.allDay;
        if (args.description) body.description = args.description;
        if (args.location) body.location = args.location;
        const created = await ctx.api.post<CalendarEvent>('/calendar/events', body);
        return ok(projectEvent(created));
      } catch (err) {
        return fail(`create_calendar_event failed: ${describeError(err)}`);
      }
    },
  );
}
