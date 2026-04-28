import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCalendarEvents, type CalendarQueryParams } from '../api/calendar';
import { syncAllGoogleAccounts } from '../api/integrations';

export function useCalendarEvents(params: CalendarQueryParams | null) {
  return useQuery({
    queryKey: params ? ['calendarEvents', params.start, params.end, params.calendarId, params.includeDeleted] : ['calendarEvents', 'disabled'],
    queryFn: params ? () => fetchCalendarEvents(params) : undefined,
    enabled: Boolean(params),
    staleTime: 15_000,
  });
}

export function useSyncGoogleCalendarsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncAllGoogleAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendarEvents'] });
      queryClient.invalidateQueries({ queryKey: ['linkedCalendars'] });
    },
  });
}
