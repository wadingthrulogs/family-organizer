import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteLayoutSnapshot,
  fetchLayoutSnapshots,
  saveLayoutSnapshot,
  type LayoutMode,
  type LayoutSnapshot,
} from '../api/layouts';

const KEY = ['layoutSnapshots'];

/** Saved layouts for one display, newest first. */
export function useLayoutSnapshots(mode: LayoutMode) {
  const query = useQuery({ queryKey: KEY, queryFn: fetchLayoutSnapshots, staleTime: 60_000 });
  const items = (query.data ?? [])
    .filter((s: LayoutSnapshot) => s.mode === mode)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return { ...query, items };
}

export function useSaveLayoutSnapshotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveLayoutSnapshot,
    onSuccess: (items) => queryClient.setQueryData(KEY, items),
  });
}

export function useDeleteLayoutSnapshotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLayoutSnapshot,
    onSuccess: (items) => queryClient.setQueryData(KEY, items),
  });
}
