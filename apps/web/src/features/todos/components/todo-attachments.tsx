import { formatAttachmentSize } from "@repo/todos";
import { Button } from "@repo/ui";
import { useRef, useState } from "react";

import { ConfirmDialog } from "../../../components/confirm-dialog";
import { useDeleteFileMutation } from "../../../graphql/generated/react-query";
import { useFileUpload } from "../../../hooks/use-file-upload";
import { useTranslation } from "../../../hooks/use-translation";

interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string | null;
}

interface TodoAttachmentsProps {
  todoId: string;
  attachments: Attachment[];
  onChanged: () => void;
}

export function TodoAttachments({ todoId, attachments, onChanged }: TodoAttachmentsProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteFileMutation = useDeleteFileMutation();

  const uploader = useFileUpload({
    entityType: "todo",
    entityId: todoId,
    onSuccess() {
      uploader.reset();
      onChanged();
    },
    onError() {
      setError(t("todos.attachments.error.uploadFailed"));
    }
  });

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      setError(null);
      uploader.upload(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function confirmDelete() {
    if (!deletingFileId) {
      return;
    }

    try {
      setError(null);
      await deleteFileMutation.mutateAsync({ fileId: deletingFileId });
      setDeletingFileId(null);
      onChanged();
    } catch {
      setError(t("todos.attachments.error.deleteFailed"));
    }
  }

  const isUploading =
    uploader.status === "uploading" ||
    uploader.status === "requesting" ||
    uploader.status === "confirming";
  const progressText = `${t("todos.attachments.uploading")} ${uploader.progress.toString()}%`;

  return (
    <div className="mt-[var(--ds-space-100)] border-t border-[var(--ds-border)] pt-[var(--ds-space-100)]">
      <div className="flex items-center justify-between gap-[var(--ds-space-100)]">
        <span className="text-xs text-[color:var(--ds-text-subtlest)]">
          {t("todos.attachments.title")}
        </span>
        <div className="flex items-center gap-[var(--ds-space-050)]">
          {isUploading ? (
            <span className="text-xs text-[color:var(--ds-text-subtle)]">{progressText}</span>
          ) : null}
          <input ref={fileInputRef} className="hidden" type="file" onChange={handleFileSelect} />
          <Button
            appearance="subtle"
            disabled={isUploading}
            spacing="compact"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("todos.attachments.attach")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-[var(--ds-space-050)] text-xs text-[color:var(--ds-text-danger)]">
          {error}
        </p>
      ) : null}

      {attachments.length > 0 ? (
        <ul className="m-0 mt-[var(--ds-space-075)] grid list-none gap-[var(--ds-space-050)] p-0">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-[var(--ds-space-100)] rounded-[var(--ds-radius-100)] bg-[var(--ds-surface-sunken)] px-[var(--ds-space-100)] py-[var(--ds-space-050)]"
            >
              <div className="flex items-center gap-[var(--ds-space-100)] overflow-hidden">
                <span className="truncate text-xs text-[color:var(--ds-text)]">
                  {file.originalName}
                </span>
                <span className="shrink-0 text-xs text-[color:var(--ds-text-subtlest)]">
                  {formatAttachmentSize(file.sizeBytes)}
                </span>
              </div>
              <div className="flex shrink-0 gap-[var(--ds-space-050)]">
                {file.downloadUrl ? (
                  <a
                    className="text-xs text-[color:var(--ds-link)] no-underline hover:underline"
                    href={file.downloadUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("todos.attachments.download")}
                  </a>
                ) : null}
                <Button
                  appearance="subtle"
                  spacing="compact"
                  type="button"
                  onClick={() => setDeletingFileId(file.id)}
                >
                  {t("todos.attachments.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        cancelLabel={t("button.cancel")}
        confirmLabel={t("todos.attachments.delete")}
        isConfirming={deleteFileMutation.status === "pending"}
        isOpen={Boolean(deletingFileId)}
        message={t("todos.attachments.deleteConfirmMessage")}
        title={t("todos.attachments.deleteConfirmTitle")}
        onCancel={() => setDeletingFileId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
