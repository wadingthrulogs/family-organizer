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

export function useCreateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateInventoryItemPayload) => createInventoryItem(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: UpdateInventoryItemPayload }) =>
      updateInventoryItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useDeleteInventoryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) => deleteInventoryItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
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
