import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { GroceryItem, GroceryList } from '../client/types.js';
import { describeError } from '../util/errors.js';

import { fail, ok, type ToolContext } from './context.js';

function projectList(l: GroceryList) {
  return { id: l.id, name: l.name, store: l.store, isActive: l.isActive };
}

function projectItem(i: GroceryItem) {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    state: i.state,
    category: i.category,
  };
}

export function registerGroceryTools(server: McpServer, ctx: ToolContext): void {
  server.tool(
    'list_grocery_lists',
    'List grocery lists. By default returns active ones only.',
    { active: z.boolean().optional() },
    async (args) => {
      try {
        const lists = await ctx.api.get<{ items: GroceryList[]; total: number }>('/grocery/lists', {
          active: args.active ?? true,
        });
        return ok({ items: lists.items.map(projectList), total: lists.total });
      } catch (err) {
        return fail(`list_grocery_lists failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'list_grocery_items',
    'List items on a single grocery list. Returns id/name/quantity/unit/state/category.',
    { listId: z.number().int().positive() },
    async (args) => {
      try {
        const items = await ctx.api.get<GroceryItem[]>(`/grocery/lists/${args.listId}/items`);
        return ok({ items: items.map(projectItem) });
      } catch (err) {
        return fail(`list_grocery_items failed: ${describeError(err)}`);
      }
    },
  );

  server.tool(
    'add_grocery_item',
    'Add item(s) to a grocery list. Provide either structured fields (name + optional quantity/unit) OR free-form `text` for natural-language bulk add ("3 bananas, 1 gal milk").',
    {
      listId: z.number().int().positive(),
      name: z.string().min(1).max(160).optional(),
      quantity: z.number().min(0).optional(),
      unit: z.string().max(40).optional(),
      category: z.string().max(80).optional(),
      text: z.string().min(1).optional(),
    },
    async (args) => {
      try {
        if (args.text && args.name) {
          return fail('Provide either `text` (bulk natural language) OR `name` (structured), not both.');
        }
        if (!args.text && !args.name) {
          return fail('Provide either `text` for bulk add or `name` for a single item.');
        }
        if (args.text) {
          const result = await ctx.api.post<{ created: GroceryItem[] }>(
            `/grocery/lists/${args.listId}/items/bulk`,
            { text: args.text },
          );
          return ok({
            added: result.created.length,
            items: result.created.map(projectItem),
          });
        }
        const body: Record<string, unknown> = { name: args.name };
        if (args.quantity !== undefined) body.quantity = args.quantity;
        if (args.unit !== undefined) body.unit = args.unit;
        if (args.category !== undefined) body.category = args.category;
        const created = await ctx.api.post<GroceryItem>(
          `/grocery/lists/${args.listId}/items`,
          body,
        );
        return ok({ added: 1, items: [projectItem(created)] });
      } catch (err) {
        return fail(`add_grocery_item failed: ${describeError(err)}`);
      }
    },
  );
}
