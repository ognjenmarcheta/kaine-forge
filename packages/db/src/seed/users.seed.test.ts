import { describe, expect, it } from "vitest";

import { TEST_USER } from "./users.seed";

describe("users.seed", () => {
  it("uses admin role for the default test user", () => {
    expect(TEST_USER.role).toBe("admin");
  });
});
