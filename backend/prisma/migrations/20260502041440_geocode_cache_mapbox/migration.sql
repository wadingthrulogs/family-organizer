-- CreateTable
CREATE TABLE "GeocodeCache" (
    "address" TEXT NOT NULL PRIMARY KEY,
    "lng" REAL NOT NULL,
    "lat" REAL NOT NULL,
    "placeName" TEXT,
    "relevance" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GeocodeCache_expiresAt_idx" ON "GeocodeCache"("expiresAt");
