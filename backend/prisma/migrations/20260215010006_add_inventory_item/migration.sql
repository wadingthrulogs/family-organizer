-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "pantryItemKey" TEXT,
    "lowStockThreshold" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_pantryItemKey_key" ON "InventoryItem"("pantryItemKey");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");
