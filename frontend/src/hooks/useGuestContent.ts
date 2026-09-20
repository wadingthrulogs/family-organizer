import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchGuestContent, requestBookLookup, updateGuestContent } from '../api/guest';

export function useGuestContent() {
  return useQuery({
    queryKey: ['guestContent'],
    queryFn: fetchGuestContent,
    staleTime: 5 * 60_000,
    // While a book lookup is in flight, poll so the cover and synopsis appear
    // without anyone touching the screen. Otherwise leave it alone.
    refetchInterval: (query) =>
      query.state.data?.books.some((b) => b.enrichStatus === 'pending') ? 10_000 : false,
  });
}

export function useRequestBookLookupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestBookLookup,
    onSuccess: (data) => queryClient.setQueryData(['guestContent'], data),
  });
}

export function useUpdateGuestContentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGuestContent,
    onSuccess: (data) => queryClient.setQueryData(['guestContent'], data),
  });
}
