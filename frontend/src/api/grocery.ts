import { api, type ApiListResponse } from './client';
import type { GroceryItem, GroceryItemState, GroceryList } from '../types/grocery';

export interface GroceryListQuery {
  includeItems?: boolean;
  active?: boolean;
}

export interface CreateGroceryListPayload {
  name: string;
  store?: string | null;
  presetKey?: string | null;
  isActive?: boolean;
}

export type UpdateGroceryListPayload = Partial<CreateGroceryListPayload>;

export interface CreateGroceryItemPayload {
  name: string;
  category?: string | null;
  quantity?: number;
  unit?: string | null;
  state?: GroceryItemState;
  assigneeUserId?: number | null;
  claimedByUserId?: number | null;
  pantryItemKey?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
}

export type UpdateGroceryItemPayload = Partial<CreateGroceryItemPayload>;

export async function fetchGroceryLists(params?: GroceryListQuery) {
  const { data } = await api.get<ApiListResponse<GroceryList>>('/grocery/lists', {
    params: {
      includeItems: params?.includeItems ?? true,
      active: params?.active,
    },
  });
  return data;
}

export async function createGroceryList(payload: CreateGroceryListPayload) {
  const { data } = await api.post<GroceryList>('/grocery/lists', payload);
  return data;
}

export async function updateGroceryList(listId: number, payload: UpdateGroceryListPayload) {
  const { data } = await api.patch<GroceryList>(`/grocery/lists/${listId}`, payload);
  return data;
}

export async function deleteGroceryList(listId: number) {
  await api.delete(`/grocery/lists/${listId}`);
}

export async function fetchGroceryItems(listId: number) {
  const { data } = await api.get<{ items: GroceryItem[]; total: number }>(`/grocery/lists/${listId}/items`);
  return data;
}

export async function createGroceryItem(listId: number, payload: CreateGroceryItemPayload) {
  const { data } = await api.post<GroceryItem>(`/grocery/lists/${listId}/items`, payload);
  return data;
}

export async function updateGroceryItem(listId: number, itemId: number, payload: UpdateGroceryItemPayload) {
  const { data } = await api.patch<GroceryItem>(`/grocery/lists/${listId}/items/${itemId}`, payload);
  return data;
}

export async function deleteGroceryItem(listId: number, itemId: number) {
  await api.delete(`/grocery/lists/${listId}/items/${itemId}`);
}

export async function addLowStockToGroceryList(listId: number) {
  const { data } = await api.post<{ items: GroceryItem[]; total: number }>(
    `/grocery/lists/${listId}/items/from-low-stock`
  );
  return data;
}

export async function bulkAddGroceryItems(listId: number, text: string) {
  const { data } = await api.post<{ items: GroceryItem[]; total: number }>(
    `/grocery/lists/${listId}/items/bulk`,
    { text }
  );
  return data;
}
