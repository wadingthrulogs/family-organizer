import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchTasks } from '../api/tasks';

const PAGE_SIZE = 50;

export function useTasks() {
  return useInfiniteQuery({
    queryKey: ['tasks'],
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 5 * 60_000,
    queryFn: ({ pageParam }) => fetchTasks({ cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
