import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCalendarEvents, type CalendarQueryParams } from '../api/calendar';
import { syncAllGoogleAccounts } from '../api/integrations';

export function useCalendarEvents(params: CalendarQueryParams | null) {
  return useQuery({
    queryKey: params ? ['calendarEvents', params.start, params.end, params.calendarId, params.includeDeleted] : ['calendarEvents', 'disabled'],
    queryFn: params ? () => fetchCalendarEvents(params) : undefined,
    enabled: Boolean(params),
    staleTime: 15_000,
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 5 * 60_000,
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
