import { describe, expect, it } from "vitest";

import { insertUserSchema } from "./users.validator";

describe("users.validator", () => {
  it("accepts valid insert payloads", () => {
    const parsed = insertUserSchema.parse({
      email: "person@example.com",
      name: "Person"
    });

    expect(parsed.email).toBe("person@example.com");
    expect(parsed.name).toBe("Person");
  });
});
