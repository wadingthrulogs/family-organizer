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
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 5 * 60_000,
  });
}
