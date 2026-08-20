import type { UploadContext, UploadRequestInput, UploadTransfer } from "./upload.lifecycle";

export interface BrowserUploadFile {
  name: string;
  size: number;
  type: string;
}

export interface ReactNativeUploadFile extends BrowserUploadFile {
  uri: string;
}

interface UploadProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

interface UploadEventTarget {
  addEventListener: (
    event: "abort" | "error" | "load" | "progress",
    listener: (event: UploadProgressEvent) => void
  ) => void;
}

export interface UploadXmlHttpRequest {
  status: number;
  upload: UploadEventTarget;
  abort: () => void;
  addEventListener: (
    event: "abort" | "error" | "load",
    listener: (event: UploadProgressEvent) => void
  ) => void;
  open: (method: string, url: string) => void;
  send: (body: unknown) => void;
  setRequestHeader: (header: string, value: string) => void;
}

interface CreateUploadTransferInput<TFile> {
  file: TFile;
  mimeType: string;
  onProgress: (progress: number) => void;
  uploadUrl: string;
  xhrFactory?: (() => UploadXmlHttpRequest) | undefined;
}

function createDefaultXhr(): UploadXmlHttpRequest {
  // SAFETY: UploadXmlHttpRequest lists only members every runtime
  // XMLHttpRequest implements; the cast probes globalThis for the constructor
  // without pulling the DOM lib into this package, and absence throws below.
  const xhrConstructor = (globalThis as { XMLHttpRequest?: new () => UploadXmlHttpRequest })
    .XMLHttpRequest;

  if (!xhrConstructor) {
    throw new Error("XMLHttpRequest is not available");
  }

  return new xhrConstructor();
}

function createXhrUploadTransfer<TBody>(
  input: CreateUploadTransferInput<TBody> & {
    toBody: (file: TBody) => unknown;
  }
): UploadTransfer {
  const xhr = (input.xhrFactory ?? createDefaultXhr)();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
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

    xhr.open("PUT", input.uploadUrl);
    xhr.setRequestHeader("Content-Type", input.mimeType);
    xhr.send(input.toBody(input.file));
  });

  return {
    abort: () => {
      xhr.abort();
    },
    promise
  };
}

export function toBrowserUploadRequestInput(
  input: { file: BrowserUploadFile } & UploadContext
): UploadRequestInput {
  return {
    originalName: input.file.name,
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size,
    entityId: input.entityId,
    entityType: input.entityType
  };
}

export function toReactNativeUploadRequestInput(
  input: { file: ReactNativeUploadFile } & UploadContext
): UploadRequestInput {
  return toBrowserUploadRequestInput(input);
}

export function createBrowserUploadTransfer(
  input: CreateUploadTransferInput<Blob>
): UploadTransfer {
  return createXhrUploadTransfer({
    ...input,
    toBody: (file) => file
  });
}

export function createReactNativeUploadTransfer(
  input: CreateUploadTransferInput<ReactNativeUploadFile>
): UploadTransfer {
  return createXhrUploadTransfer({
    ...input,
    toBody: (file) => ({
      uri: file.uri,
      type: file.type,
      name: file.name
    })
  });
}
