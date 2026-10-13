import { describe, expect, it } from "vitest";

import { boundedTail } from "./process.output";

describe("boundedTail", () => {
  it("strips colour and keeps the end", () => {
    expect(boundedTail("\u001b[32mgreen\u001b[0m\nsecond\n", 1)).toBe("second");
  });

  it("keeps at most the requested lines", () => {
    const text = Array.from({ length: 10 }, (_, index) => `line ${index}`).join("\n");
    expect(boundedTail(text, 3)).toBe("line 7\nline 8\nline 9");
  });

  it("bounds the characters and marks the cut", () => {
    const tail = boundedTail("y".repeat(100), 10, 20);
    expect(tail).toBe(`...${"y".repeat(20)}`);
  });

  it("normalizes Windows line endings and trailing blanks", () => {
    expect(boundedTail("a\r\nb\r\n\r\n")).toBe("a\nb");
  });

  it("returns an empty string for empty output", () => {
    expect(boundedTail("")).toBe("");
  });
});
