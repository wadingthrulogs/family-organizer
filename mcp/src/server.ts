import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { OrganizerApiClient } from './client/api.js';
import { UsersCache } from './client/users-cache.js';
import type { Env } from './config/env.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerChoreTools } from './tools/chores.js';
import { registerDashboardTools } from './tools/dashboard.js';
import type { ToolContext } from './tools/context.js';
import { registerGroceryTools } from './tools/grocery.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerReminderTools } from './tools/reminders.js';
import { registerTaskTools } from './tools/tasks.js';

export function buildServer(env: Env): McpServer {
  const api = new OrganizerApiClient(env);
  const users = new UsersCache(api);
  const ctx: ToolContext = { api, users };

  const server = new McpServer(
    {
      name: 'family-organizer',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {} },
    },
  );

  registerDashboardTools(server, ctx);
  registerTaskTools(server, ctx);
  registerChoreTools(server, ctx);
  registerGroceryTools(server, ctx);
  registerInventoryTools(server, ctx);
  registerCalendarTools(server, ctx);
  registerReminderTools(server, ctx);

  return server;
}
