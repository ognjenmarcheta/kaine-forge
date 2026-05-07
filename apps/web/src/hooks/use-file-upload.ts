import {
  createBrowserUploadTransfer,
  createAttachmentUploadWorkflow,
  toBrowserUploadRequestInput,
  type UploadState
} from "@repo/storage";
import { useCallback, useMemo, useState } from "react";

import {
  useConfirmUploadMutation,
  useRequestUploadUrlMutation
} from "../graphql/generated/react-query";

type UploadStatus = UploadState["status"];

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
  upload: (file: File) => void;
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

  const requestUpload = useRequestUploadUrlMutation();
  const confirmUpload = useConfirmUploadMutation();

  const lifecycle = useMemo(
    () =>
      createAttachmentUploadWorkflow<File>({
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
          toRequestInput: toBrowserUploadRequestInput,
          uploadFile: createBrowserUploadTransfer
        },
        defaultContext: {
          entityId: options.entityId,
          entityType: options.entityType
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
    (file: File) => {
      void lifecycle.upload(file);
    },
    [lifecycle]
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
