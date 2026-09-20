import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGuestContent, updateGuestContent } from '../api/guest';

export function useGuestContent() {
  return useQuery({
    queryKey: ['guestContent'],
    queryFn: fetchGuestContent,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateGuestContentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGuestContent,
    onSuccess: (data) => queryClient.setQueryData(['guestContent'], data),
  });
}
