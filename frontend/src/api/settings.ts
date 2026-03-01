import { api } from './client';
import type { HouseholdSettings } from '../types/settings';

export async function fetchSettings() {
  const { data } = await api.get<HouseholdSettings>('/settings');
  return data;
}

export async function updateSettings(payload: Partial<HouseholdSettings>) {
  const { data } = await api.patch<HouseholdSettings>('/settings', payload);
  return data;
}
