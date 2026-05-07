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
    requireOrganizationScope: () => authenticatedScope
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
      ctx as never
    );

    expect(storageAdapter.listFiles).toHaveBeenCalledWith(authenticatedScope, {
      entityId: "todo-1",
      entityType: "todo",
      status: "uploaded"
    });
  });
});
