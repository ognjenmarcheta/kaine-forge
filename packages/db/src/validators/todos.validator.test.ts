import { describe, expect, it } from "vitest";

import { insertTodoSchema } from "./todos.validator";

describe("todos.validator", () => {
  it("accepts valid insert payloads", () => {
    const parsed = insertTodoSchema.parse({
      organizationId: "550e8400-e29b-41d4-a716-446655440010",
      title: "Ship stage 8",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.organizationId).toBe("550e8400-e29b-41d4-a716-446655440010");
    expect(parsed.title).toBe("Ship stage 8");
    expect(parsed.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects insert payload without title", () => {
    expect(() =>
      insertTodoSchema.parse({
        organizationId: "550e8400-e29b-41d4-a716-446655440010",
        userId: "550e8400-e29b-41d4-a716-446655440000"
      })
    ).toThrowError();
  });

  it("rejects insert payload without organization id", () => {
    expect(() =>
      insertTodoSchema.parse({
        title: "Missing org id",
        userId: "550e8400-e29b-41d4-a716-446655440000"
      })
    ).toThrowError();
  });
});
