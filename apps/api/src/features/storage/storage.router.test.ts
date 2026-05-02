import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage.adapter", () => ({
  createFileRecord: vi.fn(),
  getFileById: vi.fn(),
  listFiles: vi.fn(),
  updateFileStatus: vi.fn()
}));

import * as storageAdapter from "./storage.adapter";
import { storageResolvers } from "./storage.router";

describe("storage.router", () => {
  const authenticatedScope = {
    organizationId: "org-1",
    user: { id: "user-1" },
    userId: "user-1"
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated access for files query", async () => {
    await expect(
      storageResolvers.Query.files({}, {}, {
        activeOrganizationId: "org-1",
        user: null
      } as never)
    ).rejects.toThrowError("authentication required");
  });

  it("rejects access without active organization for files query", async () => {
    await expect(
      storageResolvers.Query.files({}, {}, {
        activeOrganizationId: null,
        user: { id: "user-1" }
      } as never)
    ).rejects.toThrowError("active organization required");
  });

  it("lists files with authenticated organization scope", async () => {
    vi.mocked(storageAdapter.listFiles).mockResolvedValue([]);

    await storageResolvers.Query.files(
      {},
      {
        filter: {
          entityId: "todo-1",
          entityType: "todo",
          status: "uploaded"
        }
      },
      {
        activeOrganizationId: "org-1",
        user: { id: "user-1" }
      } as never
    );

    expect(storageAdapter.listFiles).toHaveBeenCalledWith(authenticatedScope, {
      entityId: "todo-1",
      entityType: "todo",
      status: "uploaded"
    });
  });
});
