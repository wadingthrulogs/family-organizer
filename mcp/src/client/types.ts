// Lean projections of the Family Organizer API responses.
// We do NOT import from frontend/src/types or backend/ — keep this file self-contained.

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  timezone: string | null;
  colorHex: string | null;
}

export interface UserListItem {
  id: number;
  username: string;
  role: AuthUser['role'];
  colorHex: string | null;
}

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'ARCHIVED';

export interface TaskAssignment {
  id: number;
  taskId: number;
  userId: number;
  status: TaskStatus;
  user?: { id: number; username: string; colorHex: string | null };
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: number;
  status: TaskStatus;
  labels: string | null;
  assignments?: TaskAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTasks {
  items: Task[];
  total: number;
  nextCursor: number | null;
}

export type ChoreAssignmentState =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SNOOZED'
  | 'SKIPPED';

export interface ChoreAssignment {
  id: number;
  choreId: number;
  userId: number | null;
  windowStart: string;
  windowEnd: string;
  state: ChoreAssignmentState;
  notes: string | null;
  completedAt: string | null;
  assignee?: { id: number; username: string; colorHex: string | null } | null;
}

export interface Chore {
  id: number;
  title: string;
  description: string | null;
  rotationType: 'ROUND_ROBIN' | 'WEIGHTED' | 'MANUAL';
  frequency: string;
  interval: number;
  eligibleUserIds: number[];
  rewardPoints: number;
  active: boolean;
  assignments?: ChoreAssignment[];
}

export interface PaginatedChores {
  items: Chore[];
  total: number;
}

export type GroceryItemState = 'NEEDED' | 'CLAIMED' | 'IN_CART' | 'PURCHASED';

export interface GroceryItem {
  id: number;
  listId: number;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  state: GroceryItemState;
  notes: string | null;
}

export interface GroceryList {
  id: number;
  name: string;
  store: string | null;
  presetKey: string | null;
  isActive: boolean;
  items?: GroceryItem[];
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  lowStockThreshold: number | null;
  notes: string | null;
}

export interface LinkedCalendar {
  id: number;
  displayName: string;
  colorHex: string | null;
  googleAccountId: number | null;
  googleAccountEmail?: string | null;
}

export interface CalendarEvent {
  id: number;
  linkedCalendarId: number | null;
  source: 'GOOGLE' | 'LOCAL';
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string | null;
  colorHex: string | null;
  location: string | null;
  linkedCalendar?: { id: number; displayName: string } | null;
}

export interface Reminder {
  id: number;
  ownerUserId: number;
  title: string;
  message: string | null;
  targetType: string;
  targetId: number | null;
  channelMask: number;
  leadTimeMinutes: number;
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}
