import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAttachments, uploadAttachment, deleteAttachment } from '../api/attachments';

export function useAttachments(entityType: string, entityId: number | null) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: () => fetchAttachments(entityType, entityId!),
    enabled: entityId !== null,
  });
}

export function useUploadAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, entityType, entityId }: { file: File; entityType: string; entityId: number }) =>
      uploadAttachment(file, entityType, entityId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attachments', variables.entityType, variables.entityId] });
    },
  });
}

export function useDeleteAttachmentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ attachmentId }: { attachmentId: number; entityType: string; entityId: number }) =>
      deleteAttachment(attachmentId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attachments', variables.entityType, variables.entityId] });
    },
  });
}
