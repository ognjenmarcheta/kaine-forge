import { describe, expect, it } from "vitest";

import { formatAttachmentSize, toTodoCreatePayload, toTodoUpdatePayload } from "./todo.workflow";

describe("todo workflow", () => {
  it("normalizes create payloads consistently across platform Adapters", () => {
    expect(
      toTodoCreatePayload({
        description: "  details  ",
        title: "  New Todo  "
      })
    ).toEqual({
      description: "details",
      title: "New Todo"
    });

    expect(
      toTodoCreatePayload({
        description: "   ",
        title: "  New Todo  "
      })
    ).toEqual({
      description: null,
      title: "New Todo"
    });
  });

  it("normalizes update payloads without dropping explicit empty descriptions", () => {
    expect(
      toTodoUpdatePayload(
        {
          description: "   ",
          title: "  Edited  "
        },
        {
          completed: true
        }
      )
    ).toEqual({
      completed: true,
      description: null,
      title: "Edited"
    });
  });

  it("formats attachment sizes with stable units", () => {
    expect(formatAttachmentSize(999)).toBe("999 B");
    expect(formatAttachmentSize(1536)).toBe("1.5 KB");
    expect(formatAttachmentSize(1024 * 1024 * 2)).toBe("2 MB");
  });
});
