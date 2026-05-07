-- AlterTable
ALTER TABLE "GoogleAccount" ADD COLUMN "lastSyncError" TEXT;
ALTER TABLE "GoogleAccount" ADD COLUMN "lastSyncErrorAt" DATETIME;
