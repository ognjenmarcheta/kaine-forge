import { describe, expect, it } from "vitest";

import { fontFamilies, fontFamilyForClassName } from "./fonts";

describe("fontFamilyForClassName", () => {
  it.each([
    ["text-base text-ds-text", fontFamilies.regular],
    ["text-sm font-medium", fontFamilies.medium],
    ["text-2xl font-semibold", fontFamilies.semibold],
    ["font-bold text-lg", fontFamilies.bold],
    ["font-mediumish", fontFamilies.regular]
  ])("maps %j to its Geist family", (className, family) => {
    expect(fontFamilyForClassName(className)).toBe(family);
  });
});
