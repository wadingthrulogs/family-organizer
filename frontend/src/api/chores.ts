import { api, type ApiListResponse } from './client';
import type { Chore, ChoreAssignmentState } from '../types/chore';

export interface CreateChorePayload {
  title: string;
  description?: string | null;
  rotationType?: Chore['rotationType'];
  frequency: string;
  interval: number;
  eligibleUserIds: number[];
  rewardPoints?: number;
  active?: boolean;
}

export async function fetchChores() {
  const { data } = await api.get<ApiListResponse<Chore>>('/chores', {
    params: { includeAssignments: true },
  });
  return data;
}

export async function createChore(payload: CreateChorePayload) {
  const { data } = await api.post<Chore>('/chores', payload);
  return data;
}

export type UpdateChorePayload = Partial<CreateChorePayload>;

export async function updateChore(choreId: number, payload: UpdateChorePayload) {
  const { data } = await api.patch<Chore>(`/chores/${choreId}`, payload);
  return data;
}

export async function deleteChore(choreId: number): Promise<void> {
  await api.delete(`/chores/${choreId}`);
}

export interface UpdateAssignmentPayload {
  state?: ChoreAssignmentState;
  notes?: string | null;
}

export async function updateChoreAssignment(assignmentId: number, payload: UpdateAssignmentPayload) {
  const { data } = await api.patch(`/chores/assignments/${assignmentId}`, payload);
  return data;
}

export async function skipChoreAssignment(assignmentId: number, reason?: string) {
  const { data } = await api.post(`/chores/assignments/${assignmentId}/skip`, { reason });
  return data;
}

export async function swapChoreAssignment(assignmentId: number, targetUserId: number) {
  const { data } = await api.post(`/chores/assignments/${assignmentId}/swap`, { targetUserId });
  return data;
}

export async function fetchChoreStreaks(choreId: number) {
  const { data } = await api.get<{ choreId: number; streaks: ChoreStreak[] }>(`/chores/${choreId}/streaks`);
  return data;
}

export interface ChoreStreak {
  userId: number;
  username: string;
  currentStreak: number;
  longestStreak: number;
  totalCompleted: number;
}
