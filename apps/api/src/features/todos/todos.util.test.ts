import { describe, expect, it } from "vitest";

import { applyTodoPatch, ensureTodoTitle, parseOptionalDescription } from "./todos.util";

describe("todos.util", () => {
  it("ensureTodoTitle rejects blank values", () => {
    expect(() => ensureTodoTitle("   ")).toThrowError("todo title is required");
  });

  it("parseOptionalDescription trims and normalizes empty strings", () => {
    expect(parseOptionalDescription("   ")).toBeNull();
    expect(parseOptionalDescription("  note  ")).toBe("note");
  });

  it("applyTodoPatch only returns editable fields", () => {
    // Assigned to a variable so the extra runtime-only key skips the
    // excess-property check a fresh literal would trigger.
    const input = {
      title: "  Edited ",
      description: "  ",
      completed: true,
      ignored: "x"
    };
    const patch = applyTodoPatch(input);

    expect(patch).toEqual({ title: "Edited", description: null, completed: true });
  });
});
