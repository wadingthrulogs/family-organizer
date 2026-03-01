import { useQuery } from '@tanstack/react-query';
import { fetchCalendarEvents, type CalendarQueryParams } from '../api/calendar';

export function useCalendarEvents(params: CalendarQueryParams | null) {
  return useQuery({
    queryKey: params ? ['calendarEvents', params.start, params.end, params.calendarId, params.includeDeleted] : ['calendarEvents', 'disabled'],
    queryFn: params ? () => fetchCalendarEvents(params) : undefined,
    enabled: Boolean(params),
    staleTime: 15_000,
  });
}
