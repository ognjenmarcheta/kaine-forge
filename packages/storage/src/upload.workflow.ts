import {
  createUploadLifecycle,
  type UploadContext,
  type UploadLifecycle,
  type UploadLifecycleAdapter,
  type UploadState
} from "./upload.lifecycle";

export interface AttachmentUploadWorkflow<TFile> extends UploadLifecycle<TFile> {
  upload: (file: TFile, context?: UploadContext) => Promise<void>;
}

interface CreateAttachmentUploadWorkflowInput<TFile> {
  adapter: UploadLifecycleAdapter<TFile>;
  defaultContext?: UploadContext | undefined;
  onError?: ((error: Error) => void) | undefined;
  onStateChange?: ((state: UploadState) => void) | undefined;
  onSuccess?: ((fileId: string) => void) | undefined;
}

export function createAttachmentUploadWorkflow<TFile>(
  input: CreateAttachmentUploadWorkflowInput<TFile>
): AttachmentUploadWorkflow<TFile> {
  const lifecycle = createUploadLifecycle({
    adapter: input.adapter,
    onError: input.onError,
    onStateChange: input.onStateChange,
    onSuccess: input.onSuccess
  });

  return {
    getState: lifecycle.getState,
    reset: lifecycle.reset,
    upload(file, context = {}) {
      return lifecycle.upload(file, {
        ...input.defaultContext,
        ...context
      });
    }
  };
}
