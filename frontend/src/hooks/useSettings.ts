import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../api/settings';
import type { HouseholdSettings } from '../types/settings';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<HouseholdSettings>) => updateSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
    },
  });
}
