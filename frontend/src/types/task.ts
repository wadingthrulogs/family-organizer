export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'ARCHIVED';

export interface TaskRecurrence {
  id: number;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string | null;
  byMonthDay?: string | null;
  until?: string | null;
  count?: number | null;
}

export interface TaskAssignee {
  id: number;
  username: string;
  colorHex: string | null;
}

export interface TaskAssignment {
  id: number;
  taskId: number;
  userId: number;
  status: string;
  progressNote?: string | null;
  completedAt?: string | null;
  user: TaskAssignee;
}

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  priority: number;
  status: TaskStatus;
  labels?: string | null;
  authorUserId?: number | null;
  recurrenceId?: number | null;
  recurrence?: TaskRecurrence | null;
  assignments?: TaskAssignment[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
