import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  createMealPlanEntry,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  sendPlanToGrocery,
  addMissingToGrocery,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  type CreateMealPlanPayload,
  type CreateMealPlanEntryPayload,
  type UpdateMealPlanEntryPayload,
  type CreateRecipePayload,
  type UpdateRecipePayload,
} from '../api/mealPlans';

export function useCreateMealPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMealPlanPayload) => createMealPlan(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useUpdateMealPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, title }: { planId: number; title?: string | null }) =>
      updateMealPlan(planId, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useDeleteMealPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: number) => deleteMealPlan(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useCreateEntryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, payload }: { planId: number; payload: CreateMealPlanEntryPayload }) =>
      createMealPlanEntry(planId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useUpdateEntryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, entryId, payload }: { planId: number; entryId: number; payload: UpdateMealPlanEntryPayload }) =>
      updateMealPlanEntry(planId, entryId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useDeleteEntryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, entryId }: { planId: number; entryId: number }) =>
      deleteMealPlanEntry(planId, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealPlans'] }),
  });
}

export function useSendToGroceryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, groceryListId }: { planId: number; groceryListId: number }) =>
      sendPlanToGrocery(planId, groceryListId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlans'] });
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useAddMissingToGroceryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, groceryListId, servings }: { recipeId: number; groceryListId: number; servings?: number }) =>
      addMissingToGrocery(recipeId, groceryListId, servings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groceryLists'] });
    },
  });
}

export function useCreateRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRecipePayload) => createRecipe(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useUpdateRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, payload }: { recipeId: number; payload: UpdateRecipePayload }) =>
      updateRecipe(recipeId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipeId: number) => deleteRecipe(recipeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });
}
