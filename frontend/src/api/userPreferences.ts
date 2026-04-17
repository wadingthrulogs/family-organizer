import { api } from './client';
import type { DashboardConfig } from '../types/dashboard';

export interface UserPreferences {
  theme: string;
  dashboardConfig: DashboardConfig | null;
  kioskConfig: DashboardConfig | null;
  hiddenTabs: string[];
}

export async function fetchUserPreferences(): Promise<UserPreferences> {
  const { data } = await api.get<UserPreferences>('/settings/me');
  return data;
}

export async function updateUserPreferences(
  payload: Partial<Pick<UserPreferences, 'theme' | 'dashboardConfig' | 'kioskConfig' | 'hiddenTabs'>>
): Promise<UserPreferences> {
  const { data } = await api.patch<UserPreferences>('/settings/me', payload);
  return data;
}
