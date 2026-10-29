import { describe, expect, it } from "vitest";

import { parseTokenColor } from "./theme.colors";

describe("parseTokenColor", () => {
  // Themes emit hex. Alpha must reach the material as opacity: folded into the color, a
  // translucent token would draw as a darker solid color.
  it.each([
    ["#0066ff", { rgb: 0x0066ff, opacity: 1 }],
    [" #0066FF\n", { rgb: 0x0066ff, opacity: 1 }],
    ["#f1f4f780", { rgb: 0xf1f4f7, opacity: 128 / 255 }],
    ["", null],
    ["rgb(0 102 255)", null]
  ])("reads %j as %j", (value, expected) => {
    expect(parseTokenColor(value)).toEqual(expected);
  });
});
