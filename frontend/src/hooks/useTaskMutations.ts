import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createTask, deleteTask, updateTask, type CreateTaskPayload, type UpdateTaskPayload } from '../api/tasks';

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: UpdateTaskPayload }) => updateTask(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: number) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
