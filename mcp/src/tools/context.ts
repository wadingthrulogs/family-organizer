import type { OrganizerApiClient } from '../client/api.js';
import type { UsersCache } from '../client/users-cache.js';

export interface ToolContext {
  api: OrganizerApiClient;
  users: UsersCache;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
