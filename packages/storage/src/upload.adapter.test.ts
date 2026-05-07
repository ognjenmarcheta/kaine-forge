import { describe, expect, it, vi } from "vitest";

import {
  createBrowserUploadTransfer,
  createReactNativeUploadTransfer,
  toBrowserUploadRequestInput,
  toReactNativeUploadRequestInput
} from "./upload.adapter";

interface ListenerMap {
  abort?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
  error?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
  load?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
  progress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void;
}

const emptyProgressEvent = {
  lengthComputable: false,
  loaded: 0,
  total: 0
};

function fakeXhr() {
  const listeners: ListenerMap = {};
  const uploadListeners: ListenerMap = {};
  const xhr = {
    status: 200,
    upload: {
      addEventListener: vi.fn(
        (event: keyof ListenerMap, listener: NonNullable<ListenerMap[keyof ListenerMap]>) => {
          uploadListeners[event] = listener;
        }
      )
    },
    abort: vi.fn(() => {
      listeners.abort?.(emptyProgressEvent);
    }),
    addEventListener: vi.fn(
      (event: keyof ListenerMap, listener: NonNullable<ListenerMap[keyof ListenerMap]>) => {
        listeners[event] = listener;
      }
    ),
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn()
  };

  return {
    listeners,
    uploadListeners,
    xhr
  };
}

describe("upload adapters", () => {
  it("maps browser File metadata into upload request input", () => {
    expect(
      toBrowserUploadRequestInput({
        entityId: "todo-1",
        entityType: "todo",
        file: {
          name: "photo.png",
          size: 1024,
          type: "image/png"
        }
      })
    ).toEqual({
      entityId: "todo-1",
      entityType: "todo",
      mimeType: "image/png",
      originalName: "photo.png",
      sizeBytes: 1024
    });
  });

  it("uploads browser Files with XHR progress and content type", async () => {
    const xhr = fakeXhr();
    const onProgress = vi.fn();
    const transfer = createBrowserUploadTransfer({
      file: new Blob(["hello"], { type: "text/plain" }),
      mimeType: "text/plain",
      onProgress,
      uploadUrl: "https://upload.example.test",
      xhrFactory: () => xhr.xhr
    });

    xhr.uploadListeners.progress?.({
      lengthComputable: true,
      loaded: 5,
      total: 10
    });
    xhr.listeners.load?.(emptyProgressEvent);

    await expect(transfer.promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(xhr.xhr.open).toHaveBeenCalledWith("PUT", "https://upload.example.test");
    expect(xhr.xhr.setRequestHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
    expect(xhr.xhr.send).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("isolates React Native upload payload shape behind an Adapter", async () => {
    const xhr = fakeXhr();
    const file = {
      name: "doc.pdf",
      size: 2048,
      type: "application/pdf",
      uri: "file:///doc.pdf"
    };

    expect(toReactNativeUploadRequestInput({ file })).toEqual({
      mimeType: "application/pdf",
      originalName: "doc.pdf",
      sizeBytes: 2048
    });

    const transfer = createReactNativeUploadTransfer({
      file,
      mimeType: "application/pdf",
      onProgress: vi.fn(),
      uploadUrl: "https://upload.example.test",
      xhrFactory: () => xhr.xhr
    });
    xhr.listeners.load?.(emptyProgressEvent);

    await expect(transfer.promise).resolves.toBeUndefined();
    expect(xhr.xhr.send).toHaveBeenCalledWith({
      name: "doc.pdf",
      type: "application/pdf",
      uri: "file:///doc.pdf"
    });
  });
});
