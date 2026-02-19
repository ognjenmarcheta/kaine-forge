import { describe, expect, it } from "vitest";

import { insertTodoSchema, selectTodoSchema } from "./todos.validator";

describe("todos.validator", () => {
  it("accepts valid insert payloads", () => {
    const parsed = insertTodoSchema.parse({
      title: "Ship stage 8",
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.title).toBe("Ship stage 8");
    expect(parsed.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects insert payload without title", () => {
    expect(() =>
      insertTodoSchema.parse({
        userId: "550e8400-e29b-41d4-a716-446655440000"
      })
    ).toThrowError();
  });

  it("accepts valid selected rows", () => {
    const parsed = selectTodoSchema.parse({
      completed: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      description: null,
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "todo",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      userId: "550e8400-e29b-41d4-a716-446655440000"
    });

    expect(parsed.completed).toBe(false);
  });
});
