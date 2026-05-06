import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { InventoryItem } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

function projectItem(i: InventoryItem) {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    lowStockThreshold: i.lowStockThreshold,
  };
}

export function registerInventoryTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_inventory',
    'List pantry / inventory items. Filter by search string, category, or lowStockOnly.',
    {
      search: z.string().max(200).optional(),
      category: z.string().max(80).optional(),
      lowStockOnly: z.boolean().optional(),
    },
    async (args) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.search) params.search = args.search;
        if (args.category) params.category = args.category;
        if (args.lowStockOnly) params.lowStock = true;
        const items = await ctx.api.get<InventoryItem[]>('/inventory', params);
        return ok({ items: items.map(projectItem), total: items.length });
      } catch (err) {
        return fail(`list_inventory failed: ${describeError(err)}`);
      }
    },
  );
}
