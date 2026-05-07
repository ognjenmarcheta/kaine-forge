import { createUploadLifecycle, type UploadState } from "@repo/storage";
import { useCallback, useMemo, useState } from "react";

import {
  useConfirmMobileUploadMutation,
  useRequestMobileUploadUrlMutation
} from "../graphql/generated/react-query";

type UploadStatus = UploadState["status"];

interface FileInput {
  name: string;
  type: string;
  size: number;
  uri: string;
}

interface UseFileUploadOptions {
  entityType?: string;
  entityId?: string;
  onSuccess?: (fileId: string) => void;
  onError?: (error: Error) => void;
}

interface UseFileUploadReturn {
  status: UploadStatus;
  progress: number;
  error: Error | null;
  fileId: string | null;
  upload: (file: FileInput) => void;
  reset: () => void;
}

const INITIAL_UPLOAD_STATE: UploadState = {
  status: "idle",
  progress: 0,
  error: null,
  fileId: null
};

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [state, setState] = useState<UploadState>(INITIAL_UPLOAD_STATE);

  const requestUpload = useRequestMobileUploadUrlMutation();
  const confirmUpload = useConfirmMobileUploadMutation();

  const lifecycle = useMemo(
    () =>
      createUploadLifecycle<FileInput>({
        adapter: {
          confirmUpload: async (fileId) => {
            await confirmUpload.mutateAsync({ fileId });
          },
          requestUploadUrl: async (input) => {
            const data = await requestUpload.mutateAsync({
              input: {
                originalName: input.originalName,
                mimeType: input.mimeType,
                sizeBytes: input.sizeBytes,
                entityType: input.entityType ?? null,
                entityId: input.entityId ?? null
              }
            });

            return data.requestUploadUrl;
          },
          toRequestInput: ({ file, entityId, entityType }) => ({
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            entityId,
            entityType
          }),
          uploadFile: ({ file, mimeType, onProgress, uploadUrl }) => {
            const xhr = new XMLHttpRequest();
            const promise = new Promise<void>((resolve, reject) => {
              xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                  onProgress(Math.round((event.loaded / event.total) * 100));
                }
              });

              xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve();
                  return;
                }

                reject(new Error(`upload failed with status ${String(xhr.status)}`));
              });

              xhr.addEventListener("error", () => {
                reject(new Error("upload failed"));
              });

              xhr.addEventListener("abort", () => {
                reject(new Error("upload aborted"));
              });

              xhr.open("PUT", uploadUrl);
              xhr.setRequestHeader("Content-Type", mimeType);
              xhr.send({ uri: file.uri, type: file.type, name: file.name } as unknown as Document);
            });

            return {
              abort: () => {
                xhr.abort();
              },
              promise
            };
          }
        },
        onError: options.onError,
        onStateChange: setState,
        onSuccess: options.onSuccess
      }),
    [confirmUpload, options.onError, options.onSuccess, requestUpload]
  );

  const reset = useCallback(() => {
    lifecycle.reset();
  }, [lifecycle]);

  const upload = useCallback(
    (file: FileInput) => {
      void lifecycle.upload(file, {
        entityId: options.entityId,
        entityType: options.entityType
      });
    },
    [lifecycle, options.entityId, options.entityType]
  );

  return {
    status: state.status,
    progress: state.progress,
    error: state.error,
    fileId: state.fileId,
    upload,
    reset
  };
}
