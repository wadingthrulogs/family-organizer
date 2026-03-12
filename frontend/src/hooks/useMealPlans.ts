import { useQuery } from '@tanstack/react-query';
import { fetchMealPlans, fetchRecipes, fetchMealPlanEntriesInRange } from '../api/mealPlans';

export function useMealPlans() {
  return useQuery({
    queryKey: ['mealPlans'],
    queryFn: fetchMealPlans,
    staleTime: 30_000,
  });
}

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
    staleTime: 60_000,
  });
}

export function useMealPlanCalendar(start: string, end: string) {
  return useQuery({
    queryKey: ['mealPlanCalendar', start, end],
    queryFn: () => fetchMealPlanEntriesInRange(start, end),
    staleTime: 30_000,
  });
}
