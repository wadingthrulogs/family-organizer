import { api } from './client';
import type { CalendarEventResponse } from '../types/calendar';

export interface CalendarQueryParams {
  start: string;
  end: string;
  calendarId?: number;
  includeDeleted?: boolean;
}

export interface LinkedCalendarInfo {
  id: number;
  displayName: string;
  colorHex: string | null;
  userId: number;
  accessRole: string;
}

export async function fetchLinkedCalendars() {
  const { data } = await api.get<{ items: LinkedCalendarInfo[] }>('/calendar/calendars');
  return data;
}

export async function fetchCalendarEvents(params: CalendarQueryParams) {
  const { data } = await api.get<CalendarEventResponse>('/calendar/events', {
    params,
  });
  return data;
}
