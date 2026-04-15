import { api, type ApiListResponse } from './client';
import type { Task, TaskStatus } from '../types/task';

export interface CreateTaskPayload {
  title: string;
  description?: string | null;
  dueAt?: string | null;
  priority?: number;
  status?: TaskStatus;
  labels?: string | null;
  assigneeUserIds?: number[];
  recurrence?: {
    frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
    interval?: number;
    byDay?: string | null;
    byMonthDay?: string | null;
    until?: string | null;
    count?: number | null;
  } | null;
}

export type UpdateTaskPayload = Partial<Omit<CreateTaskPayload, 'recurrence'>>;

export interface FetchTasksParams {
  cursor?: number;
  limit?: number;
  status?: TaskStatus;
}

export async function fetchTasks(params: FetchTasksParams = {}) {
  const { data } = await api.get<ApiListResponse<Task>>('/tasks', { params });
  return data;
}

export async function createTask(payload: CreateTaskPayload) {
  const { data } = await api.post<Task>('/tasks', payload);
  return data;
}

export async function updateTask(taskId: number, payload: UpdateTaskPayload) {
  const { data } = await api.patch<Task>(`/tasks/${taskId}`, payload);
  return data;
}

export async function deleteTask(taskId: number) {
  await api.delete(`/tasks/${taskId}`);
}

export interface TaskStatusChangeItem {
  id: number;
  taskId: number;
  fromStatus: string;
  toStatus: string;
  changedBy: number | null;
  note: string | null;
  createdAt: string;
  changer?: { id: number; username: string } | null;
}

export async function fetchTaskHistory(taskId: number) {
  const { data } = await api.get<{ taskId: number; history: TaskStatusChangeItem[] }>(`/tasks/${taskId}/history`);
  return data;
}
