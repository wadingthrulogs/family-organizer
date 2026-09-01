import { useQuery } from '@tanstack/react-query';
import { fetchMealPlans, fetchRecipes, fetchMealPlanEntriesInRange } from '../api/mealPlans';

export function useMealPlans() {
  return useQuery({
    queryKey: ['mealPlans'],
    queryFn: fetchMealPlans,
  });
}

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
    staleTime: 60_000,
    // The dashboard is a wall display nobody interacts with, so React Query's
    // refetch-on-focus never fires. Without an interval the board can sit on
    // stale data all day. Cheap against a household-sized SQLite backend.
    refetchInterval: 10 * 60_000,
  });
}

export function useMealPlanCalendar(start: string, end: string) {
  return useQuery({
    queryKey: ['mealPlanCalendar', start, end],
    queryFn: () => fetchMealPlanEntriesInRange(start, end),
  });
}
