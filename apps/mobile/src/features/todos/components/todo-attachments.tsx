import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { ConfirmModal } from "../../../components/confirm-modal";
import { useDeleteMobileFileMutation } from "../../../graphql/generated/react-query";
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toString()} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TodoAttachments({ todoId, attachments, onChanged }: TodoAttachmentsProps) {
  const { t } = useTranslation();
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deleteFileMutation = useDeleteMobileFileMutation();

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

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setError(null);
    uploader.upload({
      name: asset.name,
      type: asset.mimeType ?? "application/octet-stream",
      size: asset.size ?? 0,
      uri: asset.uri
    });
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

  async function handleDownload(url: string) {
    await Linking.openURL(url);
  }

  const isUploading =
    uploader.status === "uploading" ||
    uploader.status === "requesting" ||
    uploader.status === "confirming";
  const progressText = `${t("todos.attachments.uploading")} ${uploader.progress.toString()}%`;

  return (
    <View className="mt-2 border-t border-ds-border pt-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-ds-text-subtlest">{t("todos.attachments.title")}</Text>
        <View className="flex-row items-center gap-2">
          {isUploading ? <Text className="text-xs text-ds-text-subtle">{progressText}</Text> : null}
          <Pressable
            className="rounded-md border border-ds-border px-2 py-1"
            disabled={isUploading}
            onPress={() => {
              void handlePickFile();
            }}
          >
            <Text className="text-xs text-ds-text">{t("todos.attachments.attach")}</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text className="mt-1 text-xs text-ds-text-danger">{error}</Text> : null}

      {attachments.map((file) => (
        <View
          key={file.id}
          className="mt-1 flex-row items-center justify-between rounded-md bg-ds-surface-sunken px-2 py-1"
        >
          <View className="flex-1 flex-row items-center gap-2 overflow-hidden">
            <Text className="shrink text-xs text-ds-text" numberOfLines={1}>
              {file.originalName}
            </Text>
            <Text className="text-xs text-ds-text-subtlest">{formatFileSize(file.sizeBytes)}</Text>
          </View>
          <View className="flex-row gap-2">
            {file.downloadUrl ? (
              <Pressable
                onPress={() => {
                  void handleDownload(file.downloadUrl!);
                }}
              >
                <Text className="text-xs text-ds-link">{t("todos.attachments.download")}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setDeletingFileId(file.id)}>
              <Text className="text-xs text-ds-text-subtle">{t("todos.attachments.delete")}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <ConfirmModal
        cancelLabel={t("button.cancel")}
        confirmLabel={t("todos.attachments.delete")}
        confirmingLabel={t("common.loadingShort")}
        isConfirming={deleteFileMutation.status === "pending"}
        isOpen={Boolean(deletingFileId)}
        message={t("todos.attachments.deleteConfirmMessage")}
        title={t("todos.attachments.deleteConfirmTitle")}
        onCancel={() => setDeletingFileId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </View>
  );
}
