import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  updateGroceryItem,
  type UpdateGroceryItemPayload,
  createGroceryItem,
  type CreateGroceryItemPayload,
  createGroceryList,
  type CreateGroceryListPayload,
  deleteGroceryList,
  deleteGroceryItem,
  bulkAddGroceryItems,
  addLowStockToGroceryList,
} from '../api/grocery';

export function useCreateGroceryListMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateGroceryListPayload) => createGroceryList(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useCreateGroceryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, data }: { listId: number; data: CreateGroceryItemPayload }) => createGroceryItem(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useUpdateGroceryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, itemId, data }: { listId: number; itemId: number; data: UpdateGroceryItemPayload }) =>
      updateGroceryItem(listId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useDeleteGroceryListMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: number) => deleteGroceryList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useDeleteGroceryItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; itemId: number }) => deleteGroceryItem(listId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useBulkAddGroceryItemsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, text }: { listId: number; text: string }) => bulkAddGroceryItems(listId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useAddLowStockToGroceryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: number) => addLowStockToGroceryList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}
