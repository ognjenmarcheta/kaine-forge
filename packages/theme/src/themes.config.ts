import { byteForgeTheme } from "./themes/byte-forge/byte-forge.theme";

/** Every theme the apps ship. Add a theme here to build, check, and offer it. */
export const themes = [byteForgeTheme] as const;

/** The theme a signed-out page, a new Organization, or an unknown stored name gets. */
export const defaultTheme = byteForgeTheme;

export type ThemeName = (typeof themes)[number]["name"];
