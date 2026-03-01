import { api, type ApiListResponse } from './client';
import type { InventoryItem } from '../types/inventory';

export interface InventoryQuery {
  search?: string;
  category?: string;
  lowStock?: boolean;
}

export interface CreateInventoryItemPayload {
  name: string;
  category?: string | null;
  quantity?: number;
  unit?: string | null;
  pantryItemKey?: string | null;
  lowStockThreshold?: number | null;
  notes?: string | null;
  dateAdded?: string | null;
}

export type UpdateInventoryItemPayload = Partial<CreateInventoryItemPayload>;

export interface MoveFromGroceryPayload {
  groceryItemId: number;
  groceryListId: number;
}

export async function fetchInventoryItems(params?: InventoryQuery) {
  const { data } = await api.get<ApiListResponse<InventoryItem>>('/inventory', { params });
  return data;
}

export async function createInventoryItem(payload: CreateInventoryItemPayload) {
  const { data } = await api.post<InventoryItem>('/inventory', payload);
  return data;
}

export async function updateInventoryItem(itemId: number, payload: UpdateInventoryItemPayload) {
  const { data } = await api.patch<InventoryItem>(`/inventory/${itemId}`, payload);
  return data;
}

export async function deleteInventoryItem(itemId: number) {
  await api.delete(`/inventory/${itemId}`);
}

export async function moveGroceryToInventory(payload: MoveFromGroceryPayload) {
  const { data } = await api.post<InventoryItem>('/inventory/from-grocery', payload);
  return data;
}

export interface MoveFromGroceryListPayload {
  groceryListId: number;
}

export async function moveGroceryListToInventory(payload: MoveFromGroceryListPayload) {
  const { data } = await api.post<{ moved: number; items: InventoryItem[] }>('/inventory/from-grocery-list', payload);
  return data;
}

export async function bulkAddInventoryItems(text: string) {
  const { data } = await api.post<{ items: InventoryItem[]; total: number }>('/inventory/bulk', { text });
  return data;
}

export async function exportInventoryTxt() {
  const response = await api.get('/inventory/export', { responseType: 'blob' });
  const blob = response.data as Blob;

  // Extract filename from Content-Disposition header, fall back to default
  const disposition = response.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `inventory-${new Date().toISOString().slice(0, 10)}.txt`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
