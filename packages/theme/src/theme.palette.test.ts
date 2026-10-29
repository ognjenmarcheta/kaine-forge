import { describe, expect, it } from "vitest";

import { contrastRatio, toOklch } from "./theme.color";
import { findContrastFailures, shippedThemePairs } from "./theme.contrast";
import { createTheme } from "./theme.create";
import { emitThemeCss } from "./theme.emit";
import { createColorModes } from "./theme.palette";

describe("createTheme", () => {
  // Seeds that stress each path: a dark brand, a light brand that needs ink text, a mid tone
  // that passes with neither white nor ink, a vivid purple, and a near-black.
  it.each(["#2f6b4f", "#f15a24", "#ffd400", "#c8e64a", "#9b8cf0", "#7c3aed", "#111111"])(
    "derives a theme from %s that passes every pair a shipped theme must pass",
    (brand) => {
      const theme = createTheme({ name: "seed", label: "Seed", description: "", color: { brand } });

      expect(findContrastFailures(theme, shippedThemePairs)).toEqual([]);
    }
  );

  // The ends of the darkSurface range, where a fixed lightness step gives the least contrast.
  it.each([0.1, 0.3])("passes every shipped pair on a dark page of lightness %d", (darkSurface) => {
    const theme = createTheme({
      name: "seed",
      label: "Seed",
      description: "",
      color: { brand: "#9b8cf0", darkSurface }
    });

    expect(findContrastFailures(theme, shippedThemePairs)).toEqual([]);
  });

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

  it("pairs each chart tint with the theme's own chart color, and a tint the theme sets wins", () => {
    const green = "#2f8f4e";
    const theme = createTheme({
      name: "seed",
      label: "Seed",
      description: "",
      color: { brand: "#7c3aed" },
      // A reference's pastel, darker than the derived tint: its text color must still pass on it.
      modes: { light: { "chart-2": green, "background-chart-1": "#daddf4" } }
    });
    const tint = theme.modes.light["background-chart-2"];

    expect(Math.abs(toOklch(tint).h - toOklch(green).h)).toBeLessThan(10);
    expect(theme.modes.light["background-chart-1"]).toBe("#daddf4");
    expect(findContrastFailures(theme)).toEqual([]);
  });

  it("sets the letter spacing of every type step, and a step in type wins", () => {
    const theme = createTheme({
      name: "seed",
      label: "Seed",
      description: "",
      color: { brand: "#2f6b4f" },
      letterSpacing: "-0.01em",
      type: { display: { letterSpacing: "-0.02em" } }
    });
    const css = emitThemeCss(theme);

    expect(css).toContain("--ds-letter-spacing-body: -0.01em;");
    expect(css).toContain("--ds-letter-spacing-display: -0.02em;");
  });
});

describe("createColorModes in dark mode", () => {
  it("turns an ink brand fill light with ink text, so the primary button shows on the page", () => {
    const { dark } = createColorModes({ brand: "#111111" });

    expect(
      contrastRatio(dark["background-brand-bold"], dark.surface, dark.surface)
    ).toBeGreaterThanOrEqual(3);
    expect(dark["text-brand-inverse"]).toBe(dark["text-inverse"]);
  });

  it("keeps white text on a deep brand fill and lightens it until it shows on a card's track", () => {
    const { dark } = createColorModes({ brand: "#2f6b4f" });
    const fill = dark["background-brand-bold"];

    expect(dark["text-brand-inverse"]).toBe("#ffffff");
    expect(
      contrastRatio(fill, dark["background-neutral"], dark["surface-raised"])
    ).toBeGreaterThanOrEqual(3);
  });

  it("builds the dark page at the requested lightness", () => {
    const { dark } = createColorModes({ brand: "#2f6b4f", darkSurface: 0.265 });

    expect(toOklch(dark.surface).l).toBeCloseTo(0.265, 2);
  });
});

describe("createColorModes glow", () => {
  // Light mode casts the glow below; dark mode spreads it evenly at 1.5 times the alpha.
  it.each([
    [undefined, "0px 4px 16px #d4421a52", "0px 0px 24px #d4421a7a"],
    [2, "0px 4px 16px #d4421aa3", "0px 0px 24px #d4421af5"],
    [0, "0px 4px 16px #d4421a00", "0px 0px 24px #d4421a00"]
  ])("glows in the brand fill at strength %s", (glow, light, dark) => {
    const modes = createColorModes({ brand: "#d4421a", ...(glow === undefined ? {} : { glow }) });

    expect([modes.light["shadow-glow"], modes.dark["shadow-glow"]]).toEqual([light, dark]);
  });
});
