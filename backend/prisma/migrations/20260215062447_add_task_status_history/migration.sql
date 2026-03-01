-- CreateTable
CREATE TABLE "TaskStatusChange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "changedBy" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskStatusChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskStatusChange_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskStatusChange_taskId_createdAt_idx" ON "TaskStatusChange"("taskId", "createdAt");
