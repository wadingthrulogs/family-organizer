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
    "isPreparedMeal" BOOLEAN NOT NULL DEFAULT false,
    "dateAdded" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InventoryItem" ("category", "createdAt", "dateAdded", "id", "lowStockThreshold", "name", "notes", "pantryItemKey", "quantity", "unit", "updatedAt") SELECT "category", "createdAt", "dateAdded", "id", "lowStockThreshold", "name", "notes", "pantryItemKey", "quantity", "unit", "updatedAt" FROM "InventoryItem";
DROP TABLE "InventoryItem";
ALTER TABLE "new_InventoryItem" RENAME TO "InventoryItem";
CREATE UNIQUE INDEX "InventoryItem_pantryItemKey_key" ON "InventoryItem"("pantryItemKey");
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");
CREATE TABLE "new_Recipe" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "sourceUrl" TEXT,
    "ingredientsJson" TEXT NOT NULL DEFAULT '[]',
    "createdByUserId" INTEGER NOT NULL,
    "sourceInventoryItemId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recipe_sourceInventoryItemId_fkey" FOREIGN KEY ("sourceInventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("cookMinutes", "createdAt", "createdByUserId", "description", "id", "ingredientsJson", "prepMinutes", "servings", "sourceUrl", "title", "updatedAt") SELECT "cookMinutes", "createdAt", "createdByUserId", "description", "id", "ingredientsJson", "prepMinutes", "servings", "sourceUrl", "title", "updatedAt" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
CREATE UNIQUE INDEX "Recipe_sourceInventoryItemId_key" ON "Recipe"("sourceInventoryItemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
