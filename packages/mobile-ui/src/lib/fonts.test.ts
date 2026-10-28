import { describe, expect, it } from "vitest";

import { fontFamilyForClassName, type NativeFontFamily } from "./fonts";

const geist: NativeFontFamily = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold"
};

describe("fontFamilyForClassName", () => {
  it.each<[string, NativeFontFamily, string | undefined]>([
    ["text-base text-ds-text", geist, "Geist_400Regular"],
    ["text-sm font-medium", geist, "Geist_500Medium"],
    ["text-2xl font-semibold", geist, "Geist_600SemiBold"],
    ["font-bold text-lg", geist, "Geist_700Bold"],
    ["font-mediumish", geist, "Geist_400Regular"],
    ["text-2xl font-medium", "system-serif", "Georgia"],
    ["font-bold", "system", undefined]
  ])("maps %j with %j to %j", (className, family, expected) => {
    expect(fontFamilyForClassName(className, family)).toBe(expected);
  });
});
