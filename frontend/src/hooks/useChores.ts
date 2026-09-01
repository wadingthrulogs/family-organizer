import { useQuery } from '@tanstack/react-query';
import { fetchChores } from '../api/chores';

export function useChores() {
  return useQuery({
    queryKey: ['chores'],
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 5 * 60_000,
    queryFn: fetchChores,
  });
}
