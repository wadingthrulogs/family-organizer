import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createReminder,
  updateReminder,
  deleteReminder,
  type CreateReminderPayload,
  type UpdateReminderPayload,
} from '../api/reminders';

export function useCreateReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateReminderPayload) => createReminder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useUpdateReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reminderId, data }: { reminderId: number; data: UpdateReminderPayload }) =>
      updateReminder(reminderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

export function useDeleteReminderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reminderId: number) => deleteReminder(reminderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
