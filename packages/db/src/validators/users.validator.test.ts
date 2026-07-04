import { describe, expect, it } from "vitest";

import { insertUserSchema, selectUserSchema } from "./users.validator";

describe("users.validator", () => {
  it("accepts valid insert payloads", () => {
    const parsed = insertUserSchema.parse({
      email: "person@example.com",
      name: "Person"
    });

    expect(parsed.email).toBe("person@example.com");
    expect(parsed.name).toBe("Person");
  });

  it("accepts valid selected rows", () => {
    const parsed = selectUserSchema.parse({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      email: "person@example.com",
      emailVerified: false,
      id: "550e8400-e29b-41d4-a716-446655440000",
      image: null,
      isActive: true,
      name: "Person",
      role: "user",
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(parsed.role).toBe("user");
  });
});
