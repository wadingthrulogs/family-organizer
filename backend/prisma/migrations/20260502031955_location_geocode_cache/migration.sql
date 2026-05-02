-- CreateTable
CREATE TABLE "LocationGeocodeCache" (
    "location" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT NOT NULL,
    "lastAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "LocationGeocodeCache_expiresAt_idx" ON "LocationGeocodeCache"("expiresAt");
