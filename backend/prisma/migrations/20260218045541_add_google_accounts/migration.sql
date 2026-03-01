-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "encryptedRefreshToken" BLOB NOT NULL,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LinkedCalendar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "googleAccountId" INTEGER,
    "googleId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "colorHex" TEXT,
    "accessRole" TEXT NOT NULL,
    "syncToken" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LinkedCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LinkedCalendar_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LinkedCalendar" ("accessRole", "colorHex", "createdAt", "displayName", "googleId", "id", "lastSyncedAt", "syncToken", "updatedAt", "userId") SELECT "accessRole", "colorHex", "createdAt", "displayName", "googleId", "id", "lastSyncedAt", "syncToken", "updatedAt", "userId" FROM "LinkedCalendar";
DROP TABLE "LinkedCalendar";
ALTER TABLE "new_LinkedCalendar" RENAME TO "LinkedCalendar";
CREATE UNIQUE INDEX "LinkedCalendar_userId_googleId_key" ON "LinkedCalendar"("userId", "googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_userId_email_key" ON "GoogleAccount"("userId", "email");
