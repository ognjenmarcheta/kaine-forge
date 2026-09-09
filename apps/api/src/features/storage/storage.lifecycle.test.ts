import { describe, expect, it, vi } from "vitest";

import { createStorageLifecycle } from "./storage.lifecycle";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
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
      createDownloadUrl: async () => ({ url: "https://download.example.test" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => null,
      listFiles: async () => [],
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
      createDownloadUrl: async () => ({ url: "download-url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getObjectMetadata: async () => ({ contentType: "image/png", sizeBytes: 1024 }),
      getFileById: async () => ({
        id: "file-1",
        key: "key",
        mimeType: "image/png",
        sizeBytes: 1024,
        status: "pending"
      }),
      listFiles: async () => [],
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

  it("rejects confirm when uploaded size exceeds claimed size", async () => {
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord: async () => ({ id: "file-1", key: "key" }),
      createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "url" }),
      createDownloadUrl: async () => ({ url: "download-url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getObjectMetadata: async () => ({ contentType: "image/png", sizeBytes: 5000 }),
      getFileById: async () => ({
        id: "file-1",
        key: "key",
        mimeType: "image/png",
        sizeBytes: 1024,
        status: "pending"
      }),
      listFiles: async () => [],
      presignedUrlExpirySeconds: 900,
      updateFileStatus: async () => ({ id: "file-1", key: "key", status: "uploaded" })
    });

    await expect(lifecycle.confirmUpload(scope, "file-1")).rejects.toThrow(/exceeds claimed size/);
  });

  it("rejects confirm when the uploaded content type differs from the claimed MIME type", async () => {
    const updateFileStatus = vi.fn(async () => ({ id: "file-1", key: "key", status: "uploaded" }));
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord: async () => ({ id: "file-1", key: "key" }),
      createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "url" }),
      createDownloadUrl: async () => ({ url: "download-url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getObjectMetadata: async () => ({ contentType: "application/pdf", sizeBytes: 1024 }),
      getFileById: async () => ({
        id: "file-1",
        key: "key",
        mimeType: "image/png",
        sizeBytes: 1024,
        status: "pending"
      }),
      listFiles: async () => [],
      presignedUrlExpirySeconds: 900,
      updateFileStatus
    });

    await expect(lifecycle.confirmUpload(scope, "file-1")).rejects.toThrow(
      /does not match claimed type/
    );
    expect(updateFileStatus).not.toHaveBeenCalled();
  });

  it("keeps lookup, listing, and uploaded-only download URL behavior behind one lifecycle", async () => {
    const uploadedFile = {
      id: "file-1",
      key: "org-1/todo/file-1/photo.png",
      status: "uploaded"
    };
    const pendingFile = {
      id: "file-2",
      key: "org-1/todo/file-2/photo.png",
      status: "pending"
    };
    const listFiles = vi.fn(async () => [uploadedFile]);
    const createDownloadUrl = vi.fn(async () => ({ url: "https://download.example.test" }));
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord: async () => uploadedFile,
      createUploadUrl: async () => ({
        expiresIn: 900,
        key: uploadedFile.key,
        url: "https://upload.example.test"
      }),
      createDownloadUrl,
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async (_scope, fileId) => (fileId === "file-1" ? uploadedFile : pendingFile),
      listFiles,
      presignedUrlExpirySeconds: 900,
      updateFileStatus: async () => uploadedFile
    });

    await expect(lifecycle.getFile(scope, "file-1")).resolves.toEqual(uploadedFile);
    await expect(lifecycle.listFiles(scope, { entityType: "todo" })).resolves.toEqual([
      uploadedFile
    ]);
    await expect(lifecycle.getDownloadUrl(uploadedFile)).resolves.toBe(
      "https://download.example.test"
    );
    await expect(lifecycle.getDownloadUrl(pendingFile)).resolves.toBeNull();

    expect(listFiles).toHaveBeenCalledWith(scope, { entityType: "todo" });
    expect(createDownloadUrl).toHaveBeenCalledWith("uploads", uploadedFile.key, 900);
  });
});
