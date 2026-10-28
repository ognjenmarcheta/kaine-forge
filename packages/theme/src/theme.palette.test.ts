import { describe, expect, it } from "vitest";

import { findContrastFailures } from "./theme.contrast";
import { createTheme } from "./theme.create";

describe("createTheme", () => {
  // Seeds that stress each path: a dark brand, a light brand that needs ink text, a mid tone
  // that passes with neither white nor ink, a vivid purple, and a near-black.
  it.each(["#2f6b4f", "#f15a24", "#ffd400", "#c8e64a", "#9b8cf0", "#7c3aed", "#111111"])(
    "derives a theme from %s that passes every contrast pair",
    (brand) => {
      const theme = createTheme({ name: "seed", label: "Seed", description: "", color: { brand } });

      expect(findContrastFailures(theme)).toEqual([]);
    }
  );

  it("keeps the brand color for primary actions when its text passes", () => {
    const theme = createTheme({
      name: "seed",
      label: "Seed",
      description: "",
      color: { brand: "#2f6b4f" }
    });

    expect(theme.modes.light["background-brand-bold"]).toBe("#2f6b4f");
    expect(theme.modes.light["text-brand-inverse"]).toBe("#ffffff");
  });

  it("puts ink text on a light brand color instead of darkening it", () => {
    const theme = createTheme({
      name: "seed",
      label: "Seed",
      description: "",
      color: { brand: "#ffd400" }
    });

    expect(theme.modes.light["background-brand-bold"]).toBe("#ffd400");
    expect(theme.modes.light["text-brand-inverse"]).toBe(theme.modes.light.text);
  });
});
