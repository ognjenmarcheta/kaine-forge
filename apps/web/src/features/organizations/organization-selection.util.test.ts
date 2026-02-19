import { describe, expect, it } from "vitest";

import {
  resolveOrganizationSelection,
  type OrganizationOption
} from "./organization-selection.util";

describe("organization-selection.util", () => {
  const organizations: OrganizationOption[] = [
    { id: "org-1", name: "Personal" },
    { id: "org-2", name: "Workspace" }
  ];

  it("prefers remembered organization when it is valid", () => {
    const selected = resolveOrganizationSelection({
      organizations,
      rememberedOrganizationId: "org-2"
    });

    expect(selected?.id).toBe("org-2");
  });

  it("falls back to first organization when remembered id is invalid", () => {
    const selected = resolveOrganizationSelection({
      organizations,
      rememberedOrganizationId: "org-missing"
    });

    expect(selected?.id).toBe("org-1");
  });

  it("returns null when no organizations are available", () => {
    const selected = resolveOrganizationSelection({
      organizations: [],
      rememberedOrganizationId: "org-1"
    });

    expect(selected).toBeNull();
  });
});
