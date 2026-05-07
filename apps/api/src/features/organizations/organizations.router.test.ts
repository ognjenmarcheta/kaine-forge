import { beforeEach, describe, expect, it, vi } from "vitest";

import { organizationsResolvers } from "./organizations.router";

describe("organizations.router", () => {
  const auth = {
    getCurrentOrganizationByScope: vi.fn(),
    listOrganizationMembersByScope: vi.fn(),
    listOrganizationsByScope: vi.fn()
  };
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
    auth,
    requireOrganizationScope: () => authenticatedScope
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists organizations for authenticated user", async () => {
    auth.listOrganizationsByScope.mockResolvedValue([]);

    await organizationsResolvers.Query.organizations({}, {}, ctx as never);

    expect(auth.listOrganizationsByScope).toHaveBeenCalledWith(authenticatedScope);
  });

  it("gets current organization with correct args", async () => {
    auth.getCurrentOrganizationByScope.mockResolvedValue(null);

    await organizationsResolvers.Query.currentOrganization({}, {}, ctx as never);

    expect(auth.getCurrentOrganizationByScope).toHaveBeenCalledWith(authenticatedScope);
  });

  it("lists members with correct args", async () => {
    auth.listOrganizationMembersByScope.mockResolvedValue([]);

    await organizationsResolvers.Query.members({}, {}, ctx as never);

    expect(auth.listOrganizationMembersByScope).toHaveBeenCalledWith(authenticatedScope);
  });
});
