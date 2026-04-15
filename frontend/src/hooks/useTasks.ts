import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchTasks } from '../api/tasks';

const PAGE_SIZE = 50;

export function useTasks() {
  return useInfiniteQuery({
    queryKey: ['tasks'],
    queryFn: ({ pageParam }) => fetchTasks({ cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
