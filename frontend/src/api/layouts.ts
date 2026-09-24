import type { DashboardConfig } from '../types/dashboard';
import { api } from './client';

export type LayoutMode = 'dashboard' | 'kiosk' | 'guest';

/** A named copy of one display's layout, kept so it can be restored later. */
export interface LayoutSnapshot {
  id: string;
  name: string;
  mode: LayoutMode;
  /** ISO timestamp of when it was saved. */
  savedAt: string;
  config: DashboardConfig;
}

export async function fetchLayoutSnapshots(): Promise<LayoutSnapshot[]> {
  const { data } = await api.get<{ items: LayoutSnapshot[] }>('/settings/me/layouts');
  return data.items;
}

/** Saving under a name already used for this display replaces that one. */
export async function saveLayoutSnapshot(
  payload: { name: string; mode: LayoutMode; config: DashboardConfig }
): Promise<LayoutSnapshot[]> {
  const { data } = await api.post<{ items: LayoutSnapshot[] }>('/settings/me/layouts', payload);
  return data.items;
}

export async function deleteLayoutSnapshot(id: string): Promise<LayoutSnapshot[]> {
  const { data } = await api.delete<{ items: LayoutSnapshot[] }>(`/settings/me/layouts/${encodeURIComponent(id)}`);
  return data.items;
}
