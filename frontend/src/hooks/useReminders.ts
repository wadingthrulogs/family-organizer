import { useQuery } from '@tanstack/react-query';
import { fetchReminders, type ReminderQuery } from '../api/reminders';

export function useReminders(params?: ReminderQuery) {
  return useQuery({
    queryKey: ['reminders', params],
    queryFn: () => fetchReminders(params),
    staleTime: 20_000,
  });
}
