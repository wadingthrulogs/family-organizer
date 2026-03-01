import { useQuery } from '@tanstack/react-query';
import { fetchGroceryLists } from '../api/grocery';

export function useGroceryLists() {
  return useQuery({
    queryKey: ['groceryLists'],
    queryFn: () => fetchGroceryLists({ includeItems: true, active: true }),
    staleTime: 20_000,
  });
}
