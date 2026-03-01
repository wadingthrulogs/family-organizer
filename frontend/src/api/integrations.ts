import { api } from './client';
import type { GoogleIntegrationStatus } from '../types/integration';

export async function fetchGoogleIntegrationStatus() {
  const { data } = await api.get<GoogleIntegrationStatus>('/integrations/google');
  return data;
}

export async function requestGoogleConnectUrl(options?: { loginHint?: string }) {
  const params = new URLSearchParams();
  if (options?.loginHint) {
    params.set('login_hint', options.loginHint);
  }
  const query = params.toString();
  const path = query ? `/integrations/google/start?${query}` : '/integrations/google/start';
  const { data } = await api.get<{ url: string }>(path);
  return data.url;
}

export async function disconnectGoogleAccount(accountId: number) {
  await api.delete(`/integrations/google/${accountId}`);
}

export async function syncGoogleAccount(accountId: number) {
  const { data } = await api.post<{ message: string }>(`/integrations/google/${accountId}/sync`);
  return data;
}

export async function syncAllGoogleAccounts() {
  const { data } = await api.post<{ message: string }>('/integrations/google/sync-all');
  return data;
}
