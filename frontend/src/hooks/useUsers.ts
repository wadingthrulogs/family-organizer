import { useQuery } from '@tanstack/react-query';
import { fetchUsers, type UserListItem } from '../api/auth';

// Shared user list cache. Previously TasksWidget fetched via raw
// fetchUsers() on every mount; now the list is one React Query entry
// shared across widgets and pages. See perf-audit-2026-04 §8.
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: Infinity,
  });
}

export type { UserListItem };
