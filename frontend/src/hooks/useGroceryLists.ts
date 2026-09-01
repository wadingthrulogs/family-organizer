import { useQuery } from '@tanstack/react-query';
import { fetchGroceryLists } from '../api/grocery';

export function useGroceryLists() {
  return useQuery({
    queryKey: ['groceryLists'],
    queryFn: () => fetchGroceryLists({ includeItems: true, active: true }),
    staleTime: 20_000,
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 10 * 60_000,
  });
}
