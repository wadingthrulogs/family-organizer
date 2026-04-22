import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCommuteRoutes,
  createCommuteRoute,
  updateCommuteRoute,
  deleteCommuteRoute,
  fetchActiveCommuteEtas,
  type CreateCommuteRoutePayload,
  type UpdateCommuteRoutePayload,
} from '../api/commute';

export function useCommuteRoutes() {
  return useQuery({
    queryKey: ['commuteRoutes'],
    queryFn: fetchCommuteRoutes,
    staleTime: 30 * 1000,
  });
}

export function useActiveCommuteEtas() {
  return useQuery({
    queryKey: ['commuteEtas', 'active'],
    queryFn: fetchActiveCommuteEtas,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['commuteRoutes'] });
  queryClient.invalidateQueries({ queryKey: ['commuteEtas'] });
}

export function useCreateCommuteRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCommuteRoutePayload) => createCommuteRoute(payload),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateCommuteRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCommuteRoutePayload }) =>
      updateCommuteRoute(id, data),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteCommuteRouteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCommuteRoute(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}
