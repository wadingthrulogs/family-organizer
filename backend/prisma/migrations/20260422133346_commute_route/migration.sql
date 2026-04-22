-- CreateTable
CREATE TABLE "CommuteRoute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "destAddress" TEXT NOT NULL,
    "travelMode" TEXT NOT NULL DEFAULT 'DRIVE',
    "showStartMin" INTEGER NOT NULL,
    "showEndMin" INTEGER NOT NULL,
    "daysOfWeek" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
