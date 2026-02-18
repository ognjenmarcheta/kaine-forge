import { describe, expect, it } from "vitest";

import { requireUser } from "./auth.middleware";

describe("auth.middleware", () => {
  it("throws when user is not present", () => {
    expect(() => requireUser({ user: null })).toThrowError("authentication required");
  });

  it("returns user when authenticated", () => {
    const user = requireUser({ user: { id: "u1" } });

    expect(user.id).toBe("u1");
  });
});
