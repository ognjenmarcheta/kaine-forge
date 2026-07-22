import { describe, expect, it } from "vitest";

import { ORGANIZATIONS_DEFINITION } from "./organizations.definition";

describe("ORGANIZATIONS_DEFINITION", () => {
  it("exposes the members route used by shell navigation", () => {
    expect(ORGANIZATIONS_DEFINITION.routes.members).toBe("/members");
  });
});
