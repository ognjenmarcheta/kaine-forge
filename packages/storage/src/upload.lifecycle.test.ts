import { describe, expect, it, vi } from "vitest";

import { createUploadLifecycle } from "./upload.lifecycle";

interface TestFile {
  name: string;
  size: number;
  type: string;
}

function file(): TestFile {
  return {
    name: "photo.png",
    size: 1024,
    type: "image/png"
  };
}

describe("createUploadLifecycle", () => {
  it("runs request, upload, and confirm in order", async () => {
    const states: string[] = [];
    const uploadFile = vi.fn(() => ({
      abort: vi.fn(),
      promise: Promise.resolve()
    }));
    const confirmUpload = vi.fn(async () => undefined);
    const lifecycle = createUploadLifecycle<TestFile>({
      adapter: {
        confirmUpload,
        requestUploadUrl: async () => ({
          fileId: "file-1",
          uploadUrl: "https://upload.example.test"
        }),
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size,
          entityId: input.entityId,
          entityType: input.entityType
        }),
        uploadFile
      },
      onStateChange: (state) => {
        states.push(state.status);
      }
    });

    await lifecycle.upload(file(), {
      entityId: "todo-1",
      entityType: "todo"
    });

    expect(states).toEqual(["requesting", "uploading", "confirming", "done"]);
    expect(uploadFile).toHaveBeenCalledWith({
      file: file(),
      mimeType: "image/png",
      onProgress: expect.any(Function),
      uploadUrl: "https://upload.example.test"
    });
    expect(confirmUpload).toHaveBeenCalledWith("file-1");
    expect(lifecycle.getState()).toMatchObject({
      error: null,
      fileId: "file-1",
      progress: 100,
      status: "done"
    });
  });

  it("captures request failures", async () => {
    const error = new Error("request failed");
    const onError = vi.fn();
    const lifecycle = createUploadLifecycle<TestFile>({
      adapter: {
        confirmUpload: async () => undefined,
        requestUploadUrl: async () => {
          throw error;
        },
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size
        }),
        uploadFile: () => ({
          abort: vi.fn(),
          promise: Promise.resolve()
        })
      },
      onError
    });

    await lifecycle.upload(file());

    expect(lifecycle.getState()).toMatchObject({
      error,
      status: "error"
    });
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("captures upload failures", async () => {
    const error = new Error("upload failed");
    const lifecycle = createUploadLifecycle<TestFile>({
      adapter: {
        confirmUpload: async () => undefined,
        requestUploadUrl: async () => ({
          fileId: "file-1",
          uploadUrl: "https://upload.example.test"
        }),
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size
        }),
        uploadFile: () => ({
          abort: vi.fn(),
          promise: Promise.reject(error)
        })
      }
    });

    await lifecycle.upload(file());

    expect(lifecycle.getState()).toMatchObject({
      error,
      fileId: "file-1",
      status: "error"
    });
  });

  it("captures confirm failures", async () => {
    const error = new Error("confirm failed");
    const lifecycle = createUploadLifecycle<TestFile>({
      adapter: {
        confirmUpload: async () => {
          throw error;
        },
        requestUploadUrl: async () => ({
          fileId: "file-1",
          uploadUrl: "https://upload.example.test"
        }),
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size
        }),
        uploadFile: () => ({
          abort: vi.fn(),
          promise: Promise.resolve()
        })
      }
    });

    await lifecycle.upload(file());

    expect(lifecycle.getState()).toMatchObject({
      error,
      fileId: "file-1",
      status: "error"
    });
  });

  it("aborts an in-flight upload on reset", async () => {
    const abort = vi.fn();
    const lifecycle = createUploadLifecycle<TestFile>({
      adapter: {
        confirmUpload: async () => undefined,
        requestUploadUrl: async () => ({
          fileId: "file-1",
          uploadUrl: "https://upload.example.test"
        }),
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size
        }),
        uploadFile: () => ({
          abort,
          promise: new Promise(() => undefined)
        })
      }
    });

    void lifecycle.upload(file());
    await Promise.resolve();
    lifecycle.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(lifecycle.getState()).toEqual({
      error: null,
      fileId: null,
      progress: 0,
      status: "idle"
    });
  });
});
