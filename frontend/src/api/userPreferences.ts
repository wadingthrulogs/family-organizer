import { api } from './client';
import type { DashboardConfig } from '../types/dashboard';

export interface UserPreferences {
  theme: string;
  /** Auto-switch to a holiday theme by date; `theme` remains the base. */
  seasonalTheme: boolean;
  dashboardConfig: DashboardConfig | null;
  kioskConfig: DashboardConfig | null;
  /** Guest display layout — only guest-safe widgets (see widgetRegistry). */
  guestConfig: DashboardConfig | null;
  hiddenTabs: string[];
}

export async function fetchUserPreferences(): Promise<UserPreferences> {
  const { data } = await api.get<UserPreferences>('/settings/me');
  return data;
}

export async function updateUserPreferences(
  payload: Partial<Pick<UserPreferences, 'theme' | 'seasonalTheme' | 'dashboardConfig' | 'kioskConfig' | 'guestConfig' | 'hiddenTabs'>>
): Promise<UserPreferences> {
  const { data } = await api.patch<UserPreferences>('/settings/me', payload);
  return data;
}
