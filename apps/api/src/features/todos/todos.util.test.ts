import { describe, expect, it } from "vitest";

import {
  applyTodoPatch,
  coercePagination,
  ensureTodoTitle,
  parseOptionalDescription
} from "./todos.util";

describe("todos.util", () => {
  it("coercePagination clamps values to config boundaries", () => {
    const pagination = coercePagination(
      { limit: 999, offset: -10 },
      { defaultLimit: 20, maxLimit: 100 }
    );

    expect(pagination).toEqual({ limit: 100, offset: 0 });
  });

  it("coercePagination falls back to defaults when undefined", () => {
    const pagination = coercePagination({}, { defaultLimit: 20, maxLimit: 100 });

    expect(pagination).toEqual({ limit: 20, offset: 0 });
  });

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
