import { api, type ApiListResponse } from './client';
import type {
  CommuteRoute,
  CommuteEta,
  CommuteEtasResponse,
  TravelMode,
} from '../types/commute';

export interface CreateCommuteRoutePayload {
  name: string;
  destAddress: string;
  travelMode?: TravelMode;
  showStartMin: number;
  showEndMin: number;
  daysOfWeek?: string;
  sortOrder?: number;
  active?: boolean;
}

export type UpdateCommuteRoutePayload = Partial<CreateCommuteRoutePayload>;

export async function fetchCommuteRoutes() {
  const { data } = await api.get<ApiListResponse<CommuteRoute>>('/commute/routes');
  return data;
}

export async function createCommuteRoute(payload: CreateCommuteRoutePayload) {
  const { data } = await api.post<CommuteRoute>('/commute/routes', payload);
  return data;
}

export async function updateCommuteRoute(id: number, payload: UpdateCommuteRoutePayload) {
  const { data } = await api.patch<CommuteRoute>(`/commute/routes/${id}`, payload);
  return data;
}

export async function deleteCommuteRoute(id: number) {
  await api.delete(`/commute/routes/${id}`);
}

export async function fetchCommuteRouteEta(id: number) {
  const { data } = await api.get<CommuteEta>(`/commute/routes/${id}/eta`);
  return data;
}

export async function fetchActiveCommuteEtas() {
  const { data } = await api.get<CommuteEtasResponse>('/commute/etas/active');
  return data;
}
