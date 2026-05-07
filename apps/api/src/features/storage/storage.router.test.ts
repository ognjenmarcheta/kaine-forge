import { beforeEach, describe, expect, it, vi } from "vitest";

const storageRuntime = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  deleteFile: vi.fn(),
  getDownloadUrl: vi.fn(),
  getFile: vi.fn(),
  listFiles: vi.fn(),
  requestUploadUrl: vi.fn()
}));

vi.mock("./storage.runtime", () => ({
  createApiStorageRuntime: vi.fn(() => storageRuntime)
}));

import { storageResolvers } from "./storage.router";

describe("storage.router", () => {
  const session = {
    activeOrganizationId: "org-1",
    expiresAt: "2026-02-26T00:00:00.000Z",
    user: {
      email: "u1@example.com",
      id: "user-1",
      name: "User One"
    }
  };
  const authenticatedScope = {
    organizationId: "org-1",
    user: session.user,
    userId: "user-1"
  };
  const ctx = {
    logger: {
      warn: vi.fn()
    },
    requireOrganizationScope: () => authenticatedScope
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists files with authenticated organization scope", async () => {
    storageRuntime.listFiles.mockResolvedValue([]);

    await storageResolvers.Query.files(
      {},
      {
        filter: {
          entityId: "todo-1",
          entityType: "todo",
          status: "uploaded"
        }
      },
      ctx as never
    );

    expect(storageRuntime.listFiles).toHaveBeenCalledWith(authenticatedScope, {
      entityId: "todo-1",
      entityType: "todo",
      status: "uploaded"
    });
  });

  it("requests upload URLs through the storage runtime", async () => {
    storageRuntime.requestUploadUrl.mockResolvedValue({
      expiresIn: 900,
      fileId: "file-1",
      key: "org-1/todo/file-1/photo.png",
      uploadUrl: "https://upload.example.test"
    });

    await expect(
      storageResolvers.Mutation.requestUploadUrl(
        {},
        {
          input: {
            entityId: "todo-1",
            entityType: "todo",
            mimeType: "image/png",
            originalName: "photo.png",
            sizeBytes: 1024
          }
        },
        ctx as never
      )
    ).resolves.toEqual({
      expiresIn: 900,
      fileId: "file-1",
      key: "org-1/todo/file-1/photo.png",
      uploadUrl: "https://upload.example.test"
    });

    expect(storageRuntime.requestUploadUrl).toHaveBeenCalledWith(authenticatedScope, {
      entityId: "todo-1",
      entityType: "todo",
      mimeType: "image/png",
      originalName: "photo.png",
      sizeBytes: 1024
    });
  });

  it("resolves FileInfo download URLs without resolver context", async () => {
    storageRuntime.getDownloadUrl.mockResolvedValue("https://download.example.test");

    await expect(
      storageResolvers.FileInfo.downloadUrl({
        id: "file-1",
        key: "org-1/todo/file-1/photo.png",
        status: "uploaded"
      })
    ).resolves.toBe("https://download.example.test");

    expect(storageRuntime.getDownloadUrl).toHaveBeenCalledWith({
      id: "file-1",
      key: "org-1/todo/file-1/photo.png",
      status: "uploaded"
    });
  });
});
