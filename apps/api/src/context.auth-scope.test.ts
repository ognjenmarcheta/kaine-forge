import { describe, expect, it } from "vitest";

import { createApiAuthIdentity } from "./context.auth-scope";

describe("createApiAuthIdentity", () => {
  it("resolves Authenticated Organization Scope from the Active Organization", () => {
    const identity = createApiAuthIdentity({
      activeOrganizationId: "org-1",
      expiresAt: "2026-01-01T00:00:00.000Z",
      user: {
        email: "user@example.com",
        id: "user-1",
        name: "User"
      }
    });

    expect(identity.organizationScope).toEqual({
      organizationId: "org-1",
      user: {
        email: "user@example.com",
        id: "user-1",
        name: "User"
      },
      userId: "user-1"
    });
    expect(identity.requireOrganizationScope()).toEqual(identity.organizationScope);
  });
});
