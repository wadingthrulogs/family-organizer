-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "pantryItemKey" TEXT,
    "lowStockThreshold" REAL,
    "notes" TEXT,
    "dateAdded" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InventoryItem" ("category", "createdAt", "id", "lowStockThreshold", "name", "notes", "pantryItemKey", "quantity", "unit", "updatedAt") SELECT "category", "createdAt", "id", "lowStockThreshold", "name", "notes", "pantryItemKey", "quantity", "unit", "updatedAt" FROM "InventoryItem";
DROP TABLE "InventoryItem";
ALTER TABLE "new_InventoryItem" RENAME TO "InventoryItem";
CREATE UNIQUE INDEX "InventoryItem_pantryItemKey_key" ON "InventoryItem"("pantryItemKey");
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
