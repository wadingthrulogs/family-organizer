import { useQuery } from '@tanstack/react-query';
import { fetchChores } from '../api/chores';

export function useChores() {
  return useQuery({
    queryKey: ['chores'],
    queryFn: fetchChores,
    staleTime: 30_000,
  });
}
