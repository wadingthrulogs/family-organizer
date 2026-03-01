-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "authProvider" TEXT NOT NULL DEFAULT 'local',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "colorHex" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UserSecret" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "secretType" TEXT NOT NULL,
    "encryptedValue" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSecret_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LinkedCalendar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "googleId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "colorHex" TEXT,
    "accessRole" TEXT NOT NULL,
    "syncToken" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LinkedCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "linkedCalendarId" INTEGER,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "colorHex" TEXT,
    "location" TEXT,
    "attendees" TEXT,
    "etag" TEXT,
    "visibility" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FamilyEvent_linkedCalendarId_fkey" FOREIGN KEY ("linkedCalendarId") REFERENCES "LinkedCalendar" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskRecurrence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "byDay" TEXT,
    "byMonthDay" TEXT,
    "until" DATETIME,
    "count" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Task" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "authorUserId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "recurrenceId" INTEGER,
    "labels" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Task_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "progressNote" TEXT,
    "completedAt" DATETIME,
    CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rotationType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "eligibleUserIds" TEXT NOT NULL,
    "weightMapJson" TEXT,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChoreAssignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "choreId" INTEGER NOT NULL,
    "userId" INTEGER,
    "windowStart" DATETIME NOT NULL,
    "windowEnd" DATETIME NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "rotationOrder" INTEGER,
    "notes" TEXT,
    "completedAt" DATETIME,
    "verifiedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChoreAssignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChoreAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChoreAssignment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroceryList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerUserId" INTEGER,
    "name" TEXT NOT NULL,
    "store" TEXT,
    "presetKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroceryList_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit" TEXT,
    "state" TEXT NOT NULL DEFAULT 'NEEDED',
    "assigneeUserId" INTEGER,
    "claimedByUserId" INTEGER,
    "pantryItemKey" TEXT,
    "sortOrder" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroceryItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "GroceryList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroceryItem_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GroceryItem_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerUserId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "channelMask" INTEGER NOT NULL DEFAULT 1,
    "leadTimeMinutes" INTEGER DEFAULT 0,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reminder_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderTrigger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "reminderId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "nextFireAt" DATETIME NOT NULL,
    "lastAttemptAt" DATETIME,
    "lastStatus" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReminderTrigger_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerUserId" INTEGER,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "checksum" TEXT,
    "linkedEntityType" TEXT,
    "linkedEntityId" INTEGER,
    "scanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actorUserId" INTEGER,
    "actionType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" INTEGER,
    "payload" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchIndex" (
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    PRIMARY KEY ("entityType", "entityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSecret_userId_secretType_key" ON "UserSecret"("userId", "secretType");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedCalendar_userId_googleId_key" ON "LinkedCalendar"("userId", "googleId");

-- CreateIndex
CREATE INDEX "FamilyEvent_startAt_endAt_idx" ON "FamilyEvent"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "TaskAssignment_userId_status_idx" ON "TaskAssignment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_taskId_userId_key" ON "TaskAssignment"("taskId", "userId");

-- CreateIndex
CREATE INDEX "ChoreAssignment_state_idx" ON "ChoreAssignment"("state");

-- CreateIndex
CREATE INDEX "ReminderTrigger_nextFireAt_idx" ON "ReminderTrigger"("nextFireAt");

-- CreateIndex
CREATE INDEX "SearchIndex_content_idx" ON "SearchIndex"("content");
