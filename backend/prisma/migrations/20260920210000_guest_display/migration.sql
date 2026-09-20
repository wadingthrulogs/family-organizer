-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN "guestConfig" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "isDrinkFridge" BOOLEAN NOT NULL DEFAULT false;
