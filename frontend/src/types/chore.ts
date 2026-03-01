export type RotationType = 'ROUND_ROBIN' | 'WEIGHTED' | 'MANUAL';
export type ChoreAssignmentState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SNOOZED' | 'SKIPPED';

export interface ChoreAssignment {
  id: number;
  choreId: number;
  userId?: number | null;
  windowStart: string;
  windowEnd: string;
  state: ChoreAssignmentState;
  rotationOrder?: number | null;
  notes?: string | null;
  completedAt?: string | null;
  assignee?: {
    id: number;
    username: string;
    colorHex?: string | null;
  } | null;
}

export interface Chore {
  id: number;
  title: string;
  description?: string | null;
  rotationType: RotationType;
  frequency: string;
  interval: number;
  eligibleUserIds: number[];
  weightMap?: Record<string, number> | null;
  rewardPoints: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  assignments?: ChoreAssignment[];
}
