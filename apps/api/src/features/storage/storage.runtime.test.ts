import { describe, expect, it, vi } from "vitest";

import { createStorageRuntime } from "./storage.runtime";

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

describe("createStorageRuntime", () => {
  it("requests uploads with resolved bucket and expiry after creating the file record", async () => {
    const calls: string[] = [];
    const createFileRecord = vi.fn(async () => {
      calls.push("record");
      return {
        id: "file-1",
        key: "org-1/todo/file-1/photo.png",
        status: "pending"
      };
    });
    const createUploadUrl = vi.fn(async () => {
      calls.push("upload-url");
      return {
        expiresIn: 900,
        key: "org-1/todo/file-1/photo.png",
        url: "https://upload.example.test"
      };
    });
    const runtime = createStorageRuntime({
      bucket: () => "uploads",
      createDownloadUrl: async () => ({ url: "https://download.example.test" }),
      createFileId: () => "file-1",
      createFileRecord,
      createUploadUrl,
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => null,
      listFiles: async () => [],
      presignedUrlExpirySeconds: () => 900,
      updateFileStatus: async () => ({
        id: "file-1",
        key: "org-1/todo/file-1/photo.png",
        status: "uploaded"
      })
    });

    await expect(
      runtime.requestUploadUrl(scope, {
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

    expect(calls).toEqual(["record", "upload-url"]);
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
    expect(createUploadUrl).toHaveBeenCalledWith(
      "uploads",
      "org-1/todo/file-1/photo.png",
      "image/png",
      900
    );
  });

  it("passes authenticated organization scope to lookup and list adapters", async () => {
    const file = {
      id: "file-1",
      key: "org-1/todo/file-1/photo.png",
      status: "uploaded"
    };
    const getFileById = vi.fn(async () => file);
    const listFiles = vi.fn(async () => [file]);
    const runtime = createStorageRuntime({
      bucket: "uploads",
      createDownloadUrl: async () => ({ url: "https://download.example.test" }),
      createFileId: () => "file-1",
      createFileRecord: async () => file,
      createUploadUrl: async () => ({
        expiresIn: 900,
        key: file.key,
        url: "https://upload.example.test"
      }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById,
      listFiles,
      presignedUrlExpirySeconds: 900,
      updateFileStatus: async () => file
    });

    await expect(runtime.getFile(scope, "file-1")).resolves.toEqual(file);
    await expect(runtime.listFiles(scope, { entityType: "todo" })).resolves.toEqual([file]);

    expect(getFileById).toHaveBeenCalledWith(scope, "file-1");
    expect(listFiles).toHaveBeenCalledWith(scope, { entityType: "todo" });
  });

  it("returns download URLs only for uploaded files", async () => {
    const createDownloadUrl = vi.fn(async () => ({ url: "https://download.example.test" }));
    const runtime = createStorageRuntime({
      bucket: "uploads",
      createDownloadUrl,
      createFileId: () => "file-1",
      createFileRecord: async () => ({ id: "file-1", key: "key", status: "pending" }),
      createUploadUrl: async () => ({ expiresIn: 900, key: "key", url: "upload-url" }),
      defaultEntityType: "general",
      deleteObject: async () => undefined,
      fileExists: async () => true,
      getFileById: async () => null,
      listFiles: async () => [],
      presignedUrlExpirySeconds: 900,
      updateFileStatus: async () => ({ id: "file-1", key: "key", status: "uploaded" })
    });

    await expect(
      runtime.getDownloadUrl({ id: "file-1", key: "pending-key", status: "pending" })
    ).resolves.toBeNull();
    await expect(
      runtime.getDownloadUrl({ id: "file-2", key: "uploaded-key", status: "uploaded" })
    ).resolves.toBe("https://download.example.test");

    expect(createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(createDownloadUrl).toHaveBeenCalledWith("uploads", "uploaded-key", 900);
  });

  it("logs object-storage delete failures and still marks the file deleted", async () => {
    const logger = {
      warn: vi.fn()
    };
    const updateFileStatus = vi.fn(async () => ({
      id: "file-1",
      key: "org-1/todo/file-1/photo.png",
      status: "deleted"
    }));
    const runtime = createStorageRuntime({
      bucket: "uploads",
      createDownloadUrl: async () => ({ url: "https://download.example.test" }),
      createFileId: () => "file-1",
      createFileRecord: async () => ({
        id: "file-1",
        key: "org-1/todo/file-1/photo.png",
        status: "pending"
      }),
      createUploadUrl: async () => ({
        expiresIn: 900,
        key: "org-1/todo/file-1/photo.png",
        url: "https://upload.example.test"
      }),
      defaultEntityType: "general",
      deleteObject: async () => {
        throw new Error("storage unavailable");
      },
      fileExists: async () => true,
      getFileById: async () => ({
        id: "file-1",
        key: "org-1/todo/file-1/photo.png",
        status: "uploaded"
      }),
      listFiles: async () => [],
      logger,
      presignedUrlExpirySeconds: 900,
      updateFileStatus
    });

    await expect(runtime.deleteFile(scope, "file-1")).resolves.toBe(true);

    expect(logger.warn).toHaveBeenCalledWith(
      {
        err: expect.any(Error),
        key: "org-1/todo/file-1/photo.png"
      },
      "failed to delete object from S3"
    );
    expect(updateFileStatus).toHaveBeenCalledWith(scope, "file-1", "deleted");
  });
});
