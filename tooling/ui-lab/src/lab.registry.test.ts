import { findContrastFailures, findTargetSizeFailures } from "@repo/theme";
import { describe, expect, it } from "vitest";

import { labThemes } from "./lab.registry";

// A recreated screen may change the look, never the MUST rules: every lab theme passes the
// same contrast and target-size checks as a shipped theme (docs/ui/guidelines.md, Precedence).
describe.each(labThemes.map((theme) => [theme.name, theme] as const))("%s", (_name, theme) => {
  it("passes every contrast pair in both modes", () => {
    expect(findContrastFailures(theme)).toEqual([]);
  });

  it("keeps every control at least 24px tall", () => {
    expect(findTargetSizeFailures(theme)).toEqual([]);
  });
});
