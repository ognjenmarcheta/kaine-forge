import { useCallback, useRef, useState } from "react";

import {
  useConfirmUploadMutation,
  useRequestUploadUrlMutation
} from "../graphql/generated/react-query";

type UploadStatus = "idle" | "requesting" | "uploading" | "confirming" | "done" | "error";

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

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const abortRef = useRef<XMLHttpRequest | null>(null);

  const requestUpload = useRequestUploadUrlMutation();
  const confirmUpload = useConfirmUploadMutation();

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
    setProgress(0);
    setError(null);
    setFileId(null);
  }, []);

  const upload = useCallback(
    (file: File) => {
      setStatus("requesting");
      setProgress(0);
      setError(null);
      setFileId(null);

      requestUpload.mutate(
        {
          input: {
            originalName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            entityType: options.entityType ?? null,
            entityId: options.entityId ?? null
          }
        },
        {
          onSuccess(data) {
            const { fileId: id, uploadUrl } = data.requestUploadUrl;
            setFileId(id);
            setStatus("uploading");

            const xhr = new XMLHttpRequest();
            abortRef.current = xhr;

            xhr.upload.addEventListener("progress", (event) => {
              if (event.lengthComputable) {
                setProgress(Math.round((event.loaded / event.total) * 100));
              }
            });

            xhr.addEventListener("load", () => {
              abortRef.current = null;

              if (xhr.status >= 200 && xhr.status < 300) {
                setStatus("confirming");

                confirmUpload.mutate(
                  { fileId: id },
                  {
                    onSuccess() {
                      setStatus("done");
                      setProgress(100);
                      options.onSuccess?.(id);
                    },
                    onError(err) {
                      const confirmError =
                        err instanceof Error ? err : new Error("failed to confirm upload");
                      setStatus("error");
                      setError(confirmError);
                      options.onError?.(confirmError);
                    }
                  }
                );
              } else {
                const uploadError = new Error(`upload failed with status ${String(xhr.status)}`);
                setStatus("error");
                setError(uploadError);
                options.onError?.(uploadError);
              }
            });

            xhr.addEventListener("error", () => {
              abortRef.current = null;
              const uploadError = new Error("upload failed");
              setStatus("error");
              setError(uploadError);
              options.onError?.(uploadError);
            });

            xhr.addEventListener("abort", () => {
              abortRef.current = null;
              reset();
            });

            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
          },
          onError(err) {
            const requestError =
              err instanceof Error ? err : new Error("failed to request upload url");
            setStatus("error");
            setError(requestError);
            options.onError?.(requestError);
          }
        }
      );
    },
    [requestUpload, confirmUpload, options, reset]
  );

  return { status, progress, error, fileId, upload, reset };
}
