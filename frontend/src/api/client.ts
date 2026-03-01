import axios from 'axios';

const baseHost = import.meta.env.VITE_API_BASE?.replace(/\/$/, '');
const apiBase = baseHost ? `${baseHost}/api/v1` : '/api/v1';

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

export type ApiListResponse<T> = {
  items: T[];
  total: number;
  nextCursor?: number | null;
};
