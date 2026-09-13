import {
  createAttachmentUploadWorkflow,
  createBrowserUploadTransfer,
  toBrowserUploadRequestInput
} from "@repo/storage/client";
import { useEffect, useRef, useState } from "react";

import {
  useConfirmUploadMutation,
  useRequestUploadUrlMutation
} from "../../graphql/generated/react-query";

export function useTodoUpload(onChanged: () => Promise<void>) {
  const [upload, setUpload] = useState<{
    todoId: string;
    title: string;
    filename: string;
    progress: number;
    pending: boolean;
    failed: boolean;
  } | null>(null);
  const active = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const request = useRequestUploadUrlMutation({ retry: false });
  const confirm = useConfirmUploadMutation({ retry: false });
  async function start(file: File, todoId: string, title: string) {
    if (active.current) return;
    active.current = true;
    setUpload({ todoId, title, filename: file.name, progress: 0, pending: true, failed: false });
    const workflow = createAttachmentUploadWorkflow<File>({
      adapter: {
        toRequestInput: toBrowserUploadRequestInput,
        uploadFile: createBrowserUploadTransfer,
        requestUploadUrl: async (input) =>
          (await request.mutateAsync({ input: { ...input, entityId: todoId, entityType: "todo" } }))
            .requestUploadUrl,
        confirmUpload: async (fileId) => {
          await confirm.mutateAsync({ fileId });
        }
      },
      onStateChange: (state) => {
        if (alive.current)
          setUpload((current) =>
            current
              ? { ...current, progress: state.progress, failed: state.status === "error" }
              : current
          );
      },
      onSuccess: () => {
        if (alive.current) void onChanged().catch(() => undefined);
      }
    });
    try {
      await workflow.upload(file, { entityId: todoId, entityType: "todo" });
    } finally {
      active.current = false;
      if (alive.current)
        setUpload((current) => (current ? { ...current, pending: false } : current));
    }
  }
  return { upload, start };
}
