import { api, type ApiListResponse } from './client';
import type { Reminder } from '../types/reminder';

export interface CreateReminderPayload {
  ownerUserId: number;
  title: string;
  message?: string | null;
  targetType: string;
  targetId?: number | null;
  channelMask?: number;
  leadTimeMinutes?: number;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  enabled?: boolean;
}

export type UpdateReminderPayload = Partial<CreateReminderPayload>;

export interface ReminderQuery {
  ownerUserId?: number;
  enabled?: boolean;
  targetType?: string;
}

export async function fetchReminders(params?: ReminderQuery) {
  const { data } = await api.get<ApiListResponse<Reminder>>('/reminders', { params });
  return data;
}

export async function createReminder(payload: CreateReminderPayload) {
  const { data } = await api.post<Reminder>('/reminders', payload);
  return data;
}

export async function updateReminder(reminderId: number, payload: UpdateReminderPayload) {
  const { data } = await api.patch<Reminder>(`/reminders/${reminderId}`, payload);
  return data;
}

export async function deleteReminder(reminderId: number) {
  await api.delete(`/reminders/${reminderId}`);
}
