import { describe, expect, it } from "vitest";

import { contrastRatio } from "./theme.color";
import { findTargetSizeFailures, measureContrast, shippedThemePairs } from "./theme.contrast";
import { createTheme } from "./theme.create";
import { themes } from "./themes.config";

describe("contrastRatio", () => {
  it.each([
    ["#000000", "#ffffff", 21],
    ["#767676", "#ffffff", 4.54],
    ["#ffffff", "#767676", 4.54]
  ])("%s on %s is %d:1", (foreground, background, expected) => {
    expect(contrastRatio(foreground, background, "#ffffff")).toBeCloseTo(expected, 2);
  });
});

describe.each(themes.map((theme) => [theme.name, theme] as const))(
  "%s theme accessibility",
  (_name, theme) => {
    it.each(
      measureContrast(theme, shippedThemePairs).map((result) => [
        result.mode,
        result.foreground,
        result.background,
        result.backdrop ?? "surface",
        result.minimum,
        result.ratio
      ])
    )(
      "%s: %s on %s over %s meets %d:1",
      (_mode, _foreground, _background, _backdrop, minimum, ratio) => {
        expect(ratio).toBeGreaterThanOrEqual(minimum);
      }
    );

    it("keeps every control at least 24px tall", () => {
      expect(findTargetSizeFailures(theme)).toEqual([]);
    });
  }
);

describe("findTargetSizeFailures", () => {
  it("reads rem control heights at the 16px root size", () => {
    const theme = createTheme({
      name: "rem",
      label: "Rem",
      description: "",
      color: { brand: "#2f6b4f" },
      scale: { "control-xsmall": "1.25rem", "control-small": "1.75rem" }
    });

    expect(findTargetSizeFailures(theme)).toEqual([
      "control-xsmall is 1.25rem, needs at least 24px"
    ]);
  });
});
