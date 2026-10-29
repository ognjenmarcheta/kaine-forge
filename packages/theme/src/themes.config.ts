import { byteForgeTheme } from "./themes/byte-forge/byte-forge.theme";
import { mossTheme } from "./themes/moss/moss.theme";

/** Every theme the apps ship. Add a theme here to build, check, and offer it. */
export const themes = [byteForgeTheme, mossTheme] as const;

/** The theme a signed-out page, a new Organization, or an unknown stored name gets. */
export const defaultTheme = byteForgeTheme;

export type ThemeName = (typeof themes)[number]["name"];

const themeNames: ReadonlySet<string> = new Set(themes.map((theme) => theme.name));

export function isThemeName(value: string): value is ThemeName {
  return themeNames.has(value);
}

/** The theme to apply for a stored name: the default for none, or for a theme no longer registered. */
export function resolveThemeName(value: string | null | undefined): ThemeName {
  return value !== null && value !== undefined && isThemeName(value) ? value : defaultTheme.name;
}
