import { describe, expect, it } from "vitest";

import { contrastRatio } from "./theme.color";
import { findTargetSizeFailures, measureContrast } from "./theme.contrast";
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
      measureContrast(theme).map((result) => [
        result.mode,
        result.foreground,
        result.background,
        result.minimum,
        result.ratio
      ])
    )("%s: %s on %s meets %d:1", (_mode, _foreground, _background, minimum, ratio) => {
      expect(ratio).toBeGreaterThanOrEqual(minimum);
    });

    it("keeps every control at least 24px tall", () => {
      expect(findTargetSizeFailures(theme)).toEqual([]);
    });
  }
);
