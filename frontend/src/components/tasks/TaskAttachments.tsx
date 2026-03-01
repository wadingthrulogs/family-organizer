import { useRef } from 'react';
import { useAttachments, useUploadAttachmentMutation, useDeleteAttachmentMutation } from '../../hooks/useAttachments';
import { getAttachmentDownloadUrl } from '../../api/attachments';

interface TaskAttachmentsProps {
  taskId: number;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useAttachments('TASK', taskId);
  const uploadMutation = useUploadAttachmentMutation();
  const deleteMutation = useDeleteAttachmentMutation();

  const attachments = data?.items ?? [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadMutation.mutateAsync({ file, entityType: 'TASK', entityId: taskId });

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attachmentId: number) => {
    const confirmed = window.confirm('Delete this attachment?');
    if (!confirmed) return;
    await deleteMutation.mutateAsync({ attachmentId, entityType: 'TASK', entityId: taskId });
  };

  return (
    <div className="mt-3 border-t border-th-border-light pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </h4>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="rounded-full border border-th-border px-3 py-1 text-xs text-secondary disabled:opacity-40"
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Uploading…' : '+ Attach file'}
          </button>
        </div>
      </div>
      {uploadMutation.isError && (
        <p className="text-xs text-red-600 mb-2">
          {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed'}
        </p>
      )}
      {isLoading ? (
        <p className="text-xs text-faint">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-faint">No attachments yet.</p>
      ) : (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center justify-between rounded border border-th-border-light px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-faint">📎</span>
                <a
                  href={getAttachmentDownloadUrl(att.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline font-medium"
                  title={att.fileName}
                >
                  {att.fileName}
                </a>
                <span className="text-faint whitespace-nowrap">{formatFileSize(att.byteSize)}</span>
              </div>
              <button
                type="button"
                className="ml-2 text-red-500 hover:text-red-700 disabled:opacity-40"
                disabled={deleteMutation.isPending}
                onClick={() => handleDelete(att.id)}
                title="Delete attachment"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
