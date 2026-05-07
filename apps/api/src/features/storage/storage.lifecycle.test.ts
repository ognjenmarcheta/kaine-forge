import { describe, expect, it, vi } from "vitest";

import { createStorageLifecycle } from "./storage.lifecycle";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

describe("createStorageLifecycle", () => {
  it("validates, creates a file record, and returns a presigned upload URL", async () => {
    const createFileRecord = vi.fn(async () => ({
      id: "file-1",
      key: "org-1/todo/file-1/photo.png"
    }));
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord,
      createUploadUrl: async () => ({
        expiresIn: 900,
        key: "org-1/todo/file-1/photo.png",
        url: "https://upload.example.test"
      }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => null,
      presignedUrlExpirySeconds: 900,
      updateFileStatus: async () => ({ id: "file-1", key: "org-1/todo/file-1/photo.png" })
    });

    await expect(
      lifecycle.requestUploadUrl(scope, {
        entityId: "todo-1",
        entityType: "todo",
        mimeType: "image/png",
        originalName: "photo.png",
        sizeBytes: 1024
      })
    ).resolves.toEqual({
      expiresIn: 900,
      fileId: "file-1",
      key: "org-1/todo/file-1/photo.png",
      uploadUrl: "https://upload.example.test"
    });

    expect(createFileRecord).toHaveBeenCalledWith(scope, {
      bucket: "uploads",
      entityId: "todo-1",
      entityType: "todo",
      id: "file-1",
      key: "org-1/todo/file-1/photo.png",
      mimeType: "image/png",
      originalName: "photo.png",
      sizeBytes: 1024
    });
  });

  it("confirms only pending files that exist in object storage", async () => {
    const updateFileStatus = vi.fn(async () => ({
      id: "file-1",
      key: "key",
      status: "uploaded"
    }));
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord: async () => ({ id: "file-1", key: "key" }),
      createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => ({
        id: "file-1",
        key: "key",
        status: "pending"
      }),
      presignedUrlExpirySeconds: 900,
      updateFileStatus
    });

    await expect(lifecycle.confirmUpload(scope, "file-1")).resolves.toEqual({
      id: "file-1",
      key: "key",
      status: "uploaded"
    });
    expect(updateFileStatus).toHaveBeenCalledWith(scope, "file-1", "uploaded");
  });
});
