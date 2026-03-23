import { api, type ApiListResponse } from './client';
import type { MealPlan, MealPlanEntry, MealType, Recipe, RecipeIngredient, RecipeInventoryCheck, MealCalendarEntry } from '../types/mealPlan';

// ─── Recipe payloads ────────────────────────────────────────────────────────

export interface CreateRecipePayload {
  title: string;
  description?: string | null;
  servings?: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  sourceUrl?: string | null;
  ingredients?: RecipeIngredient[];
}

export type UpdateRecipePayload = Partial<CreateRecipePayload>;

// ─── Plan payloads ──────────────────────────────────────────────────────────

export interface CreateMealPlanPayload {
  title?: string | null;
  weekStart: string; // ISO date string for the Monday of the week
}

export interface CreateMealPlanEntryPayload {
  recipeId?: number | null;
  title: string;
  mealType: MealType;
  dayOffset: number;
  servings?: number;
  notes?: string | null;
}

export type UpdateMealPlanEntryPayload = Partial<CreateMealPlanEntryPayload>;

// ─── Recipe API ─────────────────────────────────────────────────────────────

export async function fetchRecipes(): Promise<ApiListResponse<Recipe>> {
  const { data } = await api.get<ApiListResponse<Recipe>>('/meal-plans/recipes');
  return data;
}

export async function createRecipe(payload: CreateRecipePayload): Promise<Recipe> {
  const { data } = await api.post<Recipe>('/meal-plans/recipes', payload);
  return data;
}

export async function updateRecipe(recipeId: number, payload: UpdateRecipePayload): Promise<Recipe> {
  const { data } = await api.patch<Recipe>(`/meal-plans/recipes/${recipeId}`, payload);
  return data;
}

export async function deleteRecipe(recipeId: number): Promise<void> {
  await api.delete(`/meal-plans/recipes/${recipeId}`);
}

export async function bulkImportRecipes(text: string): Promise<{ items: Recipe[]; total: number }> {
  const { data } = await api.post<{ items: Recipe[]; total: number }>('/meal-plans/recipes/bulk', { text });
  return data;
}

// ─── Meal Plan API ──────────────────────────────────────────────────────────

export async function fetchMealPlans(): Promise<ApiListResponse<MealPlan>> {
  const { data } = await api.get<ApiListResponse<MealPlan>>('/meal-plans');
  return data;
}

export async function createMealPlan(payload: CreateMealPlanPayload): Promise<MealPlan> {
  const { data } = await api.post<MealPlan>('/meal-plans', payload);
  return data;
}

export async function updateMealPlan(planId: number, payload: { title?: string | null }): Promise<MealPlan> {
  const { data } = await api.patch<MealPlan>(`/meal-plans/${planId}`, payload);
  return data;
}

export async function deleteMealPlan(planId: number): Promise<void> {
  await api.delete(`/meal-plans/${planId}`);
}

// ─── Entry API ──────────────────────────────────────────────────────────────

export async function createMealPlanEntry(planId: number, payload: CreateMealPlanEntryPayload): Promise<MealPlanEntry> {
  const { data } = await api.post<MealPlanEntry>(`/meal-plans/${planId}/entries`, payload);
  return data;
}

export async function updateMealPlanEntry(
  planId: number,
  entryId: number,
  payload: UpdateMealPlanEntryPayload
): Promise<MealPlanEntry> {
  const { data } = await api.patch<MealPlanEntry>(`/meal-plans/${planId}/entries/${entryId}`, payload);
  return data;
}

export async function deleteMealPlanEntry(planId: number, entryId: number): Promise<void> {
  await api.delete(`/meal-plans/${planId}/entries/${entryId}`);
}

// ─── Send to Grocery ────────────────────────────────────────────────────────

export interface SendToGroceryResult {
  added: number;
  skipped: number;
  items: Array<{ id: number; name: string }>;
}

export async function sendPlanToGrocery(planId: number, groceryListId: number): Promise<SendToGroceryResult> {
  const { data } = await api.post<SendToGroceryResult>(`/meal-plans/${planId}/send-to-grocery`, { groceryListId });
  return data;
}

// ─── Recipe Inventory Check ──────────────────────────────────────────────────

export async function checkRecipeInventory(recipeId: number, servings?: number): Promise<RecipeInventoryCheck> {
  const { data } = await api.get<RecipeInventoryCheck>(`/meal-plans/recipes/${recipeId}/inventory-check`, {
    params: servings != null ? { servings } : undefined,
  });
  return data;
}

export async function addMissingToGrocery(
  recipeId: number,
  groceryListId: number,
  servings?: number
): Promise<SendToGroceryResult> {
  const { data } = await api.post<SendToGroceryResult>(`/meal-plans/recipes/${recipeId}/add-missing-to-grocery`, {
    groceryListId,
    ...(servings != null ? { servings } : {}),
  });
  return data;
}

// ─── Entries by Date Range ───────────────────────────────────────────────────

export async function fetchMealPlanEntriesInRange(start: string, end: string): Promise<{ items: MealCalendarEntry[] }> {
  const { data } = await api.get<{ items: MealCalendarEntry[] }>('/meal-plans/entries-by-range', { params: { start, end } });
  return data;
}
