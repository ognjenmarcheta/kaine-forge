import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./organizations.adapter", () => ({
  getCurrentOrganizationById: vi.fn(),
  listOrganizationMembersByOrganizationId: vi.fn(),
  listOrganizationsByUserId: vi.fn()
}));

import * as organizationsAdapter from "./organizations.adapter";
import { organizationsResolvers } from "./organizations.router";

describe("organizations.router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated access for organizations query", async () => {
    await expect(
      organizationsResolvers.Query.organizations({}, {}, {
        activeOrganizationId: "org-1",
        user: null
      } as never)
    ).rejects.toThrowError("authentication required");
  });

  it("rejects unauthenticated access for currentOrganization query", async () => {
    await expect(
      organizationsResolvers.Query.currentOrganization({}, {}, {
        activeOrganizationId: "org-1",
        user: null
      } as never)
    ).rejects.toThrowError("authentication required");
  });

  it("rejects access without active organization for currentOrganization", async () => {
    await expect(
      organizationsResolvers.Query.currentOrganization({}, {}, {
        activeOrganizationId: null,
        user: { id: "user-1" }
      } as never)
    ).rejects.toThrowError("active organization required");
  });

  it("rejects access without active organization for members", async () => {
    await expect(
      organizationsResolvers.Query.members({}, {}, {
        activeOrganizationId: null,
        user: { id: "user-1" }
      } as never)
    ).rejects.toThrowError("active organization required");
  });

  it("lists organizations for authenticated user", async () => {
    vi.mocked(organizationsAdapter.listOrganizationsByUserId).mockResolvedValue([]);

    await organizationsResolvers.Query.organizations({}, {}, {
      activeOrganizationId: "org-1",
      user: { id: "user-1" }
    } as never);

    expect(organizationsAdapter.listOrganizationsByUserId).toHaveBeenCalledWith("user-1");
  });

  it("gets current organization with correct args", async () => {
    vi.mocked(organizationsAdapter.getCurrentOrganizationById).mockResolvedValue(null);

    await organizationsResolvers.Query.currentOrganization({}, {}, {
      activeOrganizationId: "org-1",
      user: { id: "user-1" }
    } as never);

    expect(organizationsAdapter.getCurrentOrganizationById).toHaveBeenCalledWith("user-1", "org-1");
  });

  it("lists members with correct args", async () => {
    vi.mocked(organizationsAdapter.listOrganizationMembersByOrganizationId).mockResolvedValue([]);

    await organizationsResolvers.Query.members({}, {}, {
      activeOrganizationId: "org-1",
      user: { id: "user-1" }
    } as never);

    expect(organizationsAdapter.listOrganizationMembersByOrganizationId).toHaveBeenCalledWith(
      "user-1",
      "org-1"
    );
  });
});
