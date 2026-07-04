import { describe, expect, it } from "vitest";

import { createApiAuthIdentity, resolveApiAuthIdentity } from "./context.auth-scope";

describe("createApiAuthIdentity", () => {
  it("resolves Authenticated Organization Scope from the Active Organization", () => {
    const identity = createApiAuthIdentity({
      activeOrganizationId: "org-1",
      expiresAt: "2026-01-01T00:00:00.000Z",
      user: {
        email: "user@example.com",
        emailVerified: false,
        id: "user-1",
        name: "User"
      }
    });

    expect(identity.organizationScope).toEqual({
      organizationId: "org-1",
      user: {
        email: "user@example.com",
        emailVerified: false,
        id: "user-1",
        name: "User"
      },
      userId: "user-1"
    });
    expect(identity.requireOrganizationScope()).toEqual(identity.organizationScope);
  });

  it("resolves Organization Membership proof for request context scope", async () => {
    const identity = await resolveApiAuthIdentity(
      {
        activeOrganizationId: "org-1",
        expiresAt: "2026-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          emailVerified: false,
          id: "user-1",
          name: "User"
        }
      },
      {
        getOrganizationMembershipProof: async () => ({
          id: "membership-1",
          organizationId: "org-1",
          role: "owner",
          userId: "user-1"
        })
      }
    );

    expect(identity.requireOrganizationScope().membership).toEqual({
      id: "membership-1",
      role: "owner",
      userId: "user-1"
    });
  });
});
