import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  moveGroceryToInventory,
  moveGroceryListToInventory,
  bulkAddInventoryItems,
  type CreateInventoryItemPayload,
  type UpdateInventoryItemPayload,
  type MoveFromGroceryPayload,
  type MoveFromGroceryListPayload,
} from '../api/inventory';
import type { ApiListResponse } from '../api/client';
import type { InventoryItem } from '../types/inventory';

export function useCreateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInventoryItemPayload) => createInventoryItem(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // Tagging an item as a prepared meal creates a linked recipe.
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useUpdateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: UpdateInventoryItemPayload }) =>
      updateInventoryItem(itemId, data),

    onMutate: async ({ itemId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['inventory'] });
      const previous = queryClient.getQueriesData<ApiListResponse<InventoryItem>>({ queryKey: ['inventory'] });
      queryClient.setQueriesData<ApiListResponse<InventoryItem>>(
        { queryKey: ['inventory'] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === itemId ? { ...item, ...data } : item
            ),
          };
        }
      );
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [queryKey, value] of context.previous) {
          queryClient.setQueryData(queryKey, value);
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // A prepared-meal toggle/rename syncs the linked recipe.
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useDeleteInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) => deleteInventoryItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // Deleting a prepared-meal item cascades to its linked recipe.
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}

export function useMoveGroceryToInventoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MoveFromGroceryPayload) => moveGroceryToInventory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useMoveGroceryListToInventoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MoveFromGroceryListPayload) => moveGroceryListToInventory(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useBulkAddInventoryItemsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (text: string) => bulkAddInventoryItems(text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
