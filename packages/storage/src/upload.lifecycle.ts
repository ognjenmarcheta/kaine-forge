export type UploadStatus = "idle" | "requesting" | "uploading" | "confirming" | "done" | "error";

export interface UploadState {
  error: Error | null;
  fileId: string | null;
  progress: number;
  status: UploadStatus;
}

export interface UploadContext {
  entityId?: string | undefined;
  entityType?: string | undefined;
}

export interface UploadRequestInput {
  entityId?: string | undefined;
  entityType?: string | undefined;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export interface UploadRequestResult {
  fileId: string;
  uploadUrl: string;
}

export interface UploadTransfer {
  abort: () => void;
  promise: Promise<void>;
}

export interface UploadLifecycleAdapter<TFile> {
  confirmUpload: (fileId: string) => Promise<void>;
  requestUploadUrl: (input: UploadRequestInput) => Promise<UploadRequestResult>;
  toRequestInput: (input: { file: TFile } & UploadContext) => UploadRequestInput;
  uploadFile: (input: {
    file: TFile;
    mimeType: string;
    onProgress: (progress: number) => void;
    uploadUrl: string;
  }) => UploadTransfer;
}

interface CreateUploadLifecycleInput<TFile> {
  adapter: UploadLifecycleAdapter<TFile>;
  onError?: ((error: Error) => void) | undefined;
  onStateChange?: ((state: UploadState) => void) | undefined;
  onSuccess?: ((fileId: string) => void) | undefined;
}

export interface UploadLifecycle<TFile> {
  getState: () => UploadState;
  reset: () => void;
  upload: (file: TFile, context?: UploadContext) => Promise<void>;
}

const IDLE_STATE: UploadState = {
  error: null,
  fileId: null,
  progress: 0,
  status: "idle"
};

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

export function createUploadLifecycle<TFile>(
  input: CreateUploadLifecycleInput<TFile>
): UploadLifecycle<TFile> {
  let state: UploadState = { ...IDLE_STATE };
  let activeTransfer: UploadTransfer | null = null;
  let generation = 0;

  function setState(nextState: UploadState): void {
    state = nextState;
    input.onStateChange?.({ ...state });
  }

  function patchState(nextState: Partial<UploadState>): void {
    setState({
      ...state,
      ...nextState
    });
  }

  function fail(error: Error): void {
    patchState({
      error,
      status: "error"
    });
    input.onError?.(error);
  }

  return {
    getState() {
      return { ...state };
    },
    reset() {
      generation += 1;

      if (activeTransfer) {
        activeTransfer.abort();
        activeTransfer = null;
      }

      setState({ ...IDLE_STATE });
    },
    async upload(file, context = {}) {
      generation += 1;
      const uploadGeneration = generation;

      if (activeTransfer) {
        activeTransfer.abort();
        activeTransfer = null;
      }

      setState({
        ...IDLE_STATE,
        status: "requesting"
      });

      try {
        const requestInput = input.adapter.toRequestInput({
          file,
          ...context
        });
        const requestResult = await input.adapter.requestUploadUrl(requestInput);

        if (uploadGeneration !== generation) {
          return;
        }

        patchState({
          fileId: requestResult.fileId,
          status: "uploading"
        });

        activeTransfer = input.adapter.uploadFile({
          file,
          mimeType: requestInput.mimeType,
          onProgress: (progress) => {
            if (uploadGeneration === generation) {
              patchState({ progress });
            }
          },
          uploadUrl: requestResult.uploadUrl
        });

        await activeTransfer.promise;
        activeTransfer = null;

        if (uploadGeneration !== generation) {
          return;
        }

        patchState({
          status: "confirming"
        });
        await input.adapter.confirmUpload(requestResult.fileId);

        if (uploadGeneration !== generation) {
          return;
        }

        patchState({
          progress: 100,
          status: "done"
        });
        input.onSuccess?.(requestResult.fileId);
      } catch (error) {
        activeTransfer = null;

        if (uploadGeneration !== generation) {
          return;
        }

        fail(toError(error, "upload failed"));
      }
    }
  };
}
