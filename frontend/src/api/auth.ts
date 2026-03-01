import { api } from './client';
import type { AuthUser, LoginPayload, RegisterPayload } from '../types/auth';

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/login', payload);
  return data;
}

export async function register(payload: RegisterPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/register', payload);
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

/* ─── Admin user management ─── */

export interface UserListItem {
  id: number;
  username: string;
  email: string | null;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  timezone: string;
  colorHex: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function fetchUsers(): Promise<{ items: UserListItem[]; total: number }> {
  const { data } = await api.get<{ items: UserListItem[]; total: number }>('/auth/users');
  return data;
}

export async function updateUserRole(userId: number, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>(`/auth/users/${userId}/role`, { role });
  return data;
}

export async function resetUserPassword(userId: number, newPassword: string): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/auth/users/${userId}/reset-password`, { newPassword });
  return data;
}

export async function deleteUser(userId: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/auth/users/${userId}`);
  return data;
}

export interface CreateUserPayload {
  username: string;
  email?: string;
  password: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export async function createUser(payload: CreateUserPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/auth/users', payload);
  return data;
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<void> {
  await api.post('/auth/me/password', payload);
}
