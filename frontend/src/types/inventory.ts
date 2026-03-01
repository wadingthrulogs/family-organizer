export interface InventoryItem {
  id: number;
  name: string;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  pantryItemKey?: string | null;
  lowStockThreshold?: number | null;
  notes?: string | null;
  dateAdded?: string | null;
  createdAt: string;
  updatedAt: string;
}
