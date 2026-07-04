import { describe, expect, it } from "vitest";

import { resolveActiveOrganizationId, slugifyOrganizationName } from "./auth.util";

describe("auth.util", () => {
  it("keeps active organization when it is still available", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: ["org-1", "org-2"],
      requestedActiveOrganizationId: "org-2"
    });

    expect(activeOrganizationId).toBe("org-2");
  });

  it("falls back to first available organization", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: ["org-1", "org-2"],
      requestedActiveOrganizationId: "org-missing"
    });

    expect(activeOrganizationId).toBe("org-1");
  });

  it("returns null when user has no organizations", () => {
    const activeOrganizationId = resolveActiveOrganizationId({
      availableOrganizationIds: [],
      requestedActiveOrganizationId: "org-1"
    });

    expect(activeOrganizationId).toBeNull();
  });

  it("slugifies organization names", () => {
    expect(slugifyOrganizationName(" Acme Workspace ")).toBe("acme-workspace");
    expect(slugifyOrganizationName("Team___42!!!")).toBe("team-42");
  });

  it("falls back to default slug when name has no valid characters", () => {
    expect(slugifyOrganizationName("   ---___***   ")).toBe("organization");
  });
});
