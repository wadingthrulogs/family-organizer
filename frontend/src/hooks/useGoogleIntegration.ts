import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectGoogleAccount,
  fetchGoogleIntegrationStatus,
  requestGoogleConnectUrl,
  syncGoogleAccount,
  syncAllGoogleAccounts,
} from '../api/integrations';

export function useGoogleIntegration() {
  return useQuery({
    queryKey: ['googleIntegration'],
    queryFn: fetchGoogleIntegrationStatus,
    staleTime: 60_000,
  });
}

export function useGoogleConnectMutation() {
  return useMutation({
    mutationFn: (options?: { loginHint?: string }) => requestGoogleConnectUrl(options),
  });
}

export function useGoogleDisconnectMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: number) => disconnectGoogleAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleIntegration'] });
    },
  });
}

export function useGoogleSyncMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accountId: number) => syncGoogleAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleIntegration'] });
    },
  });
}

export function useGoogleSyncAllMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncAllGoogleAccounts(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleIntegration'] });
    },
  });
}
