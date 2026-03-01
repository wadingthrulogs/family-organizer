import { api } from './client';

export interface Attachment {
  id: number;
  ownerUserId: number | null;
  fileName: string;
  filePath: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  linkedEntityType: string | null;
  linkedEntityId: number | null;
  scanned: boolean;
  createdAt: string;
}

export async function fetchAttachments(entityType: string, entityId: number) {
  const { data } = await api.get<{ items: Attachment[]; total: number }>('/attachments', {
    params: { linkedEntityType: entityType, linkedEntityId: entityId },
  });
  return data;
}

export async function uploadAttachment(file: File, entityType: string, entityId: number) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('linkedEntityType', entityType);
  formData.append('linkedEntityId', String(entityId));

  const { data } = await api.post<Attachment>('/attachments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export function getAttachmentDownloadUrl(attachmentId: number) {
  return `/api/v1/attachments/${attachmentId}/download`;
}

export async function deleteAttachment(attachmentId: number) {
  await api.delete(`/attachments/${attachmentId}`);
}
