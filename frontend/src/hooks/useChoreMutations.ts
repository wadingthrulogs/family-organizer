import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createChore, type CreateChorePayload, updateChore, type UpdateChorePayload, deleteChore, updateChoreAssignment, type UpdateAssignmentPayload, skipChoreAssignment, swapChoreAssignment } from '../api/chores';

export function useCreateChoreMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateChorePayload) => createChore(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}

export function useDeleteChoreMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choreId: number) => deleteChore(choreId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}

export function useUpdateChoreMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ choreId, data }: { choreId: number; data: UpdateChorePayload }) =>
      updateChore(choreId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}

export function useUpdateAssignmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, data }: { assignmentId: number; data: UpdateAssignmentPayload }) =>
      updateChoreAssignment(assignmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}

export function useSkipAssignmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, reason }: { assignmentId: number; reason?: string }) =>
      skipChoreAssignment(assignmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}

export function useSwapAssignmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assignmentId, targetUserId }: { assignmentId: number; targetUserId: number }) =>
      swapChoreAssignment(assignmentId, targetUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chores'] });
    },
  });
}
