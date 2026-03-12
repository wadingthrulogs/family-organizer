export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface RecipeIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  inventoryItemId?: number;
}

export type IngredientStatus = 'ok' | 'low' | 'missing' | 'unlinked';

export interface IngredientCheck {
  name: string;
  required?: number;
  unit?: string;
  inStock?: number;
  status: IngredientStatus;
  inventoryItemId?: number;
  inventoryName?: string;
}

export interface RecipeInventoryCheck {
  canMake: boolean;
  servings: number;
  ingredients: IngredientCheck[];
}

export interface Recipe {
  id: number;
  title: string;
  description?: string | null;
  servings: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  sourceUrl?: string | null;
  ingredients: RecipeIngredient[];
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanEntry {
  id: number;
  mealPlanId: number;
  recipeId?: number | null;
  title: string;
  mealType: MealType;
  dayOffset: number; // 0=Mon … 6=Sun
  servings: number;
  notes?: string | null;
  recipe?: { id: number; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MealCalendarEntry {
  id: number;
  title: string;
  mealType: MealType;
  actualDate: string; // YYYY-MM-DD
  servings: number;
  notes?: string | null;
  recipeId?: number | null;
  mealPlanId: number;
}

export interface MealPlan {
  id: number;
  title?: string | null;
  weekStart: string;
  entries: MealPlanEntry[];
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}
