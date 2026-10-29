import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it.each([
    ["rounded-button", "rounded-full", "rounded-full"],
    ["rounded-full", "rounded-card", "rounded-card"],
    ["rounded-field", "rounded-sm", "rounded-sm"],
    ["rounded-badge", "rounded-dialog", "rounded-dialog"],
    ["shadow-raised", "shadow-none", "shadow-none"],
    ["shadow-none", "shadow-card", "shadow-card"],
    ["shadow-card", "shadow-glow", "shadow-glow"],
    ["p-card", "p-0", "p-0"],
    ["p-ds-200", "p-card", "p-card"]
  ])("keeps only the later class of %s then %s", (earlier, later, expected) => {
    expect(cn(earlier, later)).toBe(expected);
  });
});
