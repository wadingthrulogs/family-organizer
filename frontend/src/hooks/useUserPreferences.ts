import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from '../api/userPreferences';

export function useUserPreferences() {
  return useQuery({
    queryKey: ['userPreferences'],
    queryFn: fetchUserPreferences,
    staleTime: 60_000,
  });
}

export function useUpdateUserPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<Pick<UserPreferences, 'theme' | 'dashboardConfig' | 'kioskConfig' | 'hiddenTabs'>>) =>
      updateUserPreferences(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['userPreferences'], data);
    },
  });
}
