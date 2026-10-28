import { describe, expect, it, vi } from "vitest";

// A second feature that resolves a root field the todos feature already owns.
vi.mock("../features/notes/notes.router", () => ({
  notesResolvers: { Query: { todos: () => [] } }
}));

describe("api schema", () => {
  it("refuses to load when two features resolve the same field", async () => {
    await expect(import("./builder")).rejects.toThrowError("duplicate resolver field Query.todos");
  });
});
