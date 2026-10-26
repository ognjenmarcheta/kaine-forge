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
  it("confirms only pending files that exist in object storage", async () => {
    const updateFileStatus = vi.fn(async () => ({
      id: "file-1",
      key: "key",
      status: "uploaded"
    }));
    const lifecycleFor = (stored: { status: string; exists: boolean }) =>
      createStorageLifecycle({
        bucket: "uploads",
        createFileId: () => "file-1",
        createFileRecord: async () => ({ id: "file-1", key: "key" }),
        createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "url" }),
        createDownloadUrl: async () => ({ url: "download-url" }),
        defaultEntityType: "general",
        deleteObject: async () => undefined,
        fileExists: async () => stored.exists,
        getObjectMetadata: async () => ({ contentType: "image/png", sizeBytes: 1024 }),
        getFileById: async () => ({
          id: "file-1",
          key: "key",
          mimeType: "image/png",
          sizeBytes: 1024,
          status: stored.status
        }),
        listFiles: async () => [],
        presignedUrlExpirySeconds: 900,
        todoExists: async () => true,
        updateFileStatus
      });

    await expect(
      lifecycleFor({ status: "uploaded", exists: true }).confirmUpload(scope, "file-1")
    ).rejects.toThrow("expected pending");
    await expect(
      lifecycleFor({ status: "pending", exists: false }).confirmUpload(scope, "file-1")
    ).rejects.toThrow("has not been uploaded");
    expect(updateFileStatus).not.toHaveBeenCalled();

    await expect(
      lifecycleFor({ status: "pending", exists: true }).confirmUpload(scope, "file-1")
    ).resolves.toEqual({
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
      todoExists: async () => true,
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
      todoExists: async () => true,
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
      todoExists: async () => true,
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

  it("links an Attachment to a Todo only when that Todo is in the Active Organization", async () => {
    const createFileRecord = vi.fn(async () => ({ id: "file-1", key: "key" }));
    const todoExists = vi.fn(async (_scope: unknown, todoId: string) => todoId === "todo-own");
    const lifecycle = createStorageLifecycle({
      bucket: "uploads",
      createFileId: () => "file-1",
      createFileRecord,
      createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "url" }),
      createDownloadUrl: async () => ({ url: "download-url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => null,
      listFiles: async () => [],
      presignedUrlExpirySeconds: 900,
      todoExists,
      updateFileStatus: async () => ({ id: "file-1", key: "key" })
    });
    const upload = { mimeType: "image/png", originalName: "a.png", sizeBytes: 1024 };

    await expect(
      lifecycle.requestUploadUrl(scope, { ...upload, entityId: "todo-other", entityType: "todo" })
    ).rejects.toThrow("attachment target not found");
    await expect(
      lifecycle.requestUploadUrl(scope, { ...upload, entityType: "todo" })
    ).rejects.toThrow("attachment target not found");
    expect(createFileRecord).not.toHaveBeenCalled();

    await expect(
      lifecycle.requestUploadUrl(scope, { ...upload, entityId: "todo-own", entityType: "todo" })
    ).resolves.toMatchObject({ fileId: "file-1" });
    expect(todoExists).toHaveBeenCalledWith(scope, "todo-own");
  });
});
