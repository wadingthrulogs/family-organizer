export type GroceryItemState = 'NEEDED' | 'CLAIMED' | 'IN_CART' | 'PURCHASED';

export interface GroceryItem {
  id: number;
  listId: number;
  name: string;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  state: GroceryItemState;
  assigneeUserId?: number | null;
  claimedByUserId?: number | null;
  pantryItemKey?: string | null;
  sortOrder?: number | null;
  notes?: string | null;
  movedToInventoryAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroceryList {
  id: number;
  ownerUserId?: number | null;
  name: string;
  store?: string | null;
  presetKey?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  items?: GroceryItem[];
}
