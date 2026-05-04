import { describe, expect, it } from "vitest";

import { requireAuthenticatedOrganizationScope } from "./auth.scope";

describe("auth.scope", () => {
  it("throws when a Session is not present", () => {
    expect(() => requireAuthenticatedOrganizationScope(null)).toThrowError(
      "authentication required"
    );
  });

  it("throws when the Session has no Active Organization", () => {
    expect(() =>
      requireAuthenticatedOrganizationScope({
        activeOrganizationId: null,
        expiresAt: "2026-02-26T00:00:00.000Z",
        user: {
          email: "u1@example.com",
          id: "user-1",
          name: "User One"
        }
      })
    ).toThrowError("active organization required");
  });

  it("returns Authenticated Organization Scope for a scoped Session", () => {
    const scope = requireAuthenticatedOrganizationScope({
      activeOrganizationId: "org-1",
      expiresAt: "2026-02-26T00:00:00.000Z",
      user: {
        email: "u1@example.com",
        id: "user-1",
        name: "User One"
      }
    });

    expect(scope).toEqual({
      organizationId: "org-1",
      user: {
        email: "u1@example.com",
        id: "user-1",
        name: "User One"
      },
      userId: "user-1"
    });
  });
});
