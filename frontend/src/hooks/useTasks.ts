import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '../api/tasks';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
  });
}
