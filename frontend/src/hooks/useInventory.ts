import { useQuery } from '@tanstack/react-query';
import { fetchInventoryItems, type InventoryQuery } from '../api/inventory';

export function useInventory(params?: InventoryQuery) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: () => fetchInventoryItems(params),
    staleTime: 20_000,
  });
}
