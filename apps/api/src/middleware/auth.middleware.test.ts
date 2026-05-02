import { describe, expect, it } from "vitest";

import { requireAuthenticatedOrganizationScope } from "./auth.middleware";

describe("auth.middleware", () => {
  it("throws when user is not present for authenticated organization scope", () => {
    expect(() =>
      requireAuthenticatedOrganizationScope({
        activeOrganizationId: "org-1",
        user: null
      })
    ).toThrowError("authentication required");
  });

  it("throws when active organization is not present for authenticated organization scope", () => {
    expect(() =>
      requireAuthenticatedOrganizationScope({
        activeOrganizationId: null,
        user: { email: "u1@example.com", id: "u1", name: "User One" }
      })
    ).toThrowError("active organization required");
  });

  it("returns authenticated organization scope when user and active organization are present", () => {
    const scope = requireAuthenticatedOrganizationScope({
      activeOrganizationId: "org-1",
      user: { email: "u1@example.com", id: "u1", name: "User One" }
    });

    expect(scope).toEqual({
      organizationId: "org-1",
      user: { email: "u1@example.com", id: "u1", name: "User One" },
      userId: "u1"
    });
  });
});
