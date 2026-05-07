import { describe, expect, it, vi } from "vitest";

import { createAttachmentUploadWorkflow } from "./upload.workflow";

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

describe("createAttachmentUploadWorkflow", () => {
  it("adapts file payloads and keeps Todo association through request/upload/confirm", async () => {
    const requestUploadUrl = vi.fn(async () => ({
      fileId: "file-1",
      uploadUrl: "https://upload.example.test"
    }));
    const uploadFile = vi.fn(() => ({
      abort: vi.fn(),
      promise: Promise.resolve()
    }));
    const confirmUpload = vi.fn(async () => undefined);
    const onSuccess = vi.fn();
    const workflow = createAttachmentUploadWorkflow<TestFile>({
      adapter: {
        confirmUpload,
        requestUploadUrl,
        toRequestInput: (input) => ({
          originalName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size,
          entityId: input.entityId,
          entityType: input.entityType
        }),
        uploadFile
      },
      defaultContext: {
        entityId: "todo-1",
        entityType: "todo"
      },
      onSuccess
    });

    await workflow.upload(file());

    expect(requestUploadUrl).toHaveBeenCalledWith({
      originalName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      entityId: "todo-1",
      entityType: "todo"
    });
    expect(uploadFile).toHaveBeenCalledWith({
      file: file(),
      mimeType: "image/png",
      onProgress: expect.any(Function),
      uploadUrl: "https://upload.example.test"
    });
    expect(confirmUpload).toHaveBeenCalledWith("file-1");
    expect(onSuccess).toHaveBeenCalledWith("file-1");
  });

  it("resets lifecycle state and preserves the configured default context", async () => {
    const abort = vi.fn();
    const workflow = createAttachmentUploadWorkflow<TestFile>({
      adapter: {
        confirmUpload: async () => undefined,
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
        uploadFile: () => ({
          abort,
          promise: new Promise(() => undefined)
        })
      },
      defaultContext: {
        entityId: "todo-1",
        entityType: "todo"
      }
    });

    void workflow.upload(file());
    await Promise.resolve();
    workflow.reset();

    expect(abort).toHaveBeenCalledOnce();
    expect(workflow.getState()).toEqual({
      error: null,
      fileId: null,
      progress: 0,
      status: "idle"
    });
  });
});
