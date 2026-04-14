import { useQuery } from '@tanstack/react-query';
import { fetchReminders, type ReminderQuery } from '../api/reminders';

// Destructure into primitive key parts so inline-object callers don't
// thrash the cache. See perf-audit-2026-04 §6.
export function useReminders(params?: ReminderQuery) {
  const { ownerUserId, enabled, targetType = '' } = params ?? {};
  return useQuery({
    queryKey: ['reminders', ownerUserId ?? null, enabled ?? null, targetType],
    queryFn: () => fetchReminders({ ownerUserId, enabled, targetType: targetType || undefined }),
    staleTime: 20_000,
  });
}
