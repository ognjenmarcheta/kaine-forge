import { describe, expect, it } from "vitest";

import {
  desktopNativeTheme,
  emitDesktopNativeThemeSet,
  firstFamily,
  type GpuiThemeConfig,
  toPx
} from "./theme.native";
import { byteForgeTheme } from "./themes/byte-forge/byte-forge.theme";
import { mossTheme } from "./themes/moss/moss.theme";
import { defaultTheme, themes } from "./themes.config";

describe("native desktop theme output", () => {
  it("resolves rem and px lengths to device pixels at 16px per rem", () => {
    expect(toPx("0.5rem")).toBe(8);
    expect(toPx("9999px")).toBe(9999);
    expect(toPx("0px")).toBe(0);
    expect(() => toPx("50%")).toThrow(/not a px or rem length/);
    expect(firstFamily('"Geist Variable", -apple-system, sans-serif')).toBe("Geist Variable");
  });

  it("emits a light and a dark config per registered theme and flags the default", () => {
    const set: { themes: GpuiThemeConfig[] } = JSON.parse(
      emitDesktopNativeThemeSet(themes, defaultTheme)
    );
    expect(set.themes.map((config) => config.name)).toEqual(
      themes.flatMap((theme) => [`${theme.name} light`, `${theme.name} dark`])
    );
    expect(set.themes.filter((config) => config.is_default).map((config) => config.name)).toEqual([
      `${defaultTheme.name} light`,
      `${defaultTheme.name} dark`
    ]);
    for (const config of set.themes) {
      for (const [key, value] of Object.entries(config.colors)) {
        expect(value, `${config.name} ${key}`).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
      }
    }
  });

  it("resolves component aliases through the scale per theme", () => {
    const byteForge = desktopNativeTheme(byteForgeTheme);
    const moss = desktopNativeTheme(mossTheme);
    expect(byteForge.components.buttonRadius).toBe(9999);
    expect(moss.components.buttonRadius).toBe(6);
    expect(moss.modes.light.cardShadow).toBe("none");
  });
});
