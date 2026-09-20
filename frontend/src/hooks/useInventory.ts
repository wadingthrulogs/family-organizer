import { useQuery } from '@tanstack/react-query';
import { fetchInventoryItems, type InventoryQuery } from '../api/inventory';

// Destructure into primitive key parts so that callers passing an inline
// object (e.g. useInventory({ lowStock: true })) don't thrash the query
// cache on every render. See perf-audit-2026-04 §6.
export function useInventory(params?: InventoryQuery) {
  const { search = '', category = '', lowStock = false, drinkFridge = false } = params ?? {};
  return useQuery({
    queryKey: ['inventory', search, category, lowStock, drinkFridge],
    queryFn: () => fetchInventoryItems({ search, category, lowStock: lowStock || undefined, drinkFridge: drinkFridge || undefined }),
    staleTime: 20_000,
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 10 * 60_000,
  });
}
