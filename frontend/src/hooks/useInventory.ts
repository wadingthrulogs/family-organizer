import { useQuery } from '@tanstack/react-query';
import { fetchInventoryItems, type InventoryQuery } from '../api/inventory';

// Destructure into primitive key parts so that callers passing an inline
// object (e.g. useInventory({ lowStock: true })) don't thrash the query
// cache on every render. See perf-audit-2026-04 §6.
export function useInventory(params?: InventoryQuery) {
  const { search = '', category = '', lowStock = false } = params ?? {};
  return useQuery({
    queryKey: ['inventory', search, category, lowStock],
    queryFn: () => fetchInventoryItems({ search, category, lowStock }),
    staleTime: 20_000,
  });
}
