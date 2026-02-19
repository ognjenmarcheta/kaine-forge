import { describe, expect, it } from "vitest";

import { requireActiveOrganizationId, requireUser } from "./auth.middleware";

describe("auth.middleware", () => {
  it("throws when user is not present", () => {
    expect(() => requireUser({ user: null })).toThrowError("authentication required");
  });

  it("returns user when authenticated", () => {
    const user = requireUser({ user: { id: "u1" } });

    expect(user.id).toBe("u1");
  });

  it("throws when active organization is not present", () => {
    expect(() => requireActiveOrganizationId({ activeOrganizationId: null })).toThrowError(
      "active organization required"
    );
  });

  it("returns active organization id when present", () => {
    const activeOrganizationId = requireActiveOrganizationId({
      activeOrganizationId: "org-1"
    });

    expect(activeOrganizationId).toBe("org-1");
  });
});
