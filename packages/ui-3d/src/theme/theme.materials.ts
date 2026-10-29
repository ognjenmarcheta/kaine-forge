import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { Color, MeshLambertMaterial, SRGBColorSpace } from "three";

import { mapTokens, readTokenColors, type ThemeColorToken } from "./theme.colors";

/** A theme color for a material: the color in three's working space, and its opacity. */
export interface ThemeColor {
  readonly color: Color;
  readonly opacity: number;
}

const THEME_ATTRIBUTES = ["data-theme", "data-color-mode"];
const BLACK = new Color(0, 0, 0);

function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: THEME_ATTRIBUTES
  });
  return () => observer.disconnect();
}

const themeSnapshot = (): string =>
  THEME_ATTRIBUTES.map((name) => document.documentElement.getAttribute(name) ?? "").join("|");

/**
 * Turns `--ds-*` color tokens into three.js colors, read from the canvas, so the scene follows
 * the theme of the page around it. Reads again when `data-theme` or `data-color-mode` changes
 * on <html>, then asks for a frame. Pass a constant object: a new object reads the tokens again.
 * Use it inside the Viewport3D scene.
 */
export function useThemeColors<Key extends string>(
  tokens: Readonly<Record<Key, ThemeColorToken>>
): Readonly<Record<Key, ThemeColor>> {
  const canvas = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const theme = useSyncExternalStore(subscribeToTheme, themeSnapshot);

  const colors = useMemo(() => {
    // `theme` is a dependency only so a theme change reads the tokens again.
    void theme;
    const read = readTokenColors(canvas, tokens);
    // Tokens are sRGB; setHex with SRGBColorSpace converts them to three's linear working space.
    return mapTokens(tokens, (_token, key) => ({
      color: new Color().setHex(read[key].rgb, SRGBColorSpace),
      opacity: read[key].opacity
    }));
  }, [canvas, theme, tokens]);

  useEffect(() => {
    invalidate();
  }, [colors, invalidate]);

  return colors;
}

export interface ThemeMaterialOptions<Key extends string> {
  /**
   * Materials drawn in exactly their token color on every face, unshaded, such as a selection
   * highlight measured at 3:1 against the base and the stage. Lit materials shade between the
   * viewer's ambient share and full color, so a measured pair can drop below 3:1 on faces
   * turned from the light; a kept color cannot.
   */
  keepColor?: readonly Key[];
}

/**
 * One shared material per state, colored by a theme token, such as `{ base: "--ds-text",
 * highlight: "--ds-background-selected-bold" }`. Give every mesh in a state the same material:
 * one material per state keeps the draw state simple and the GPU memory flat. Lambert shading
 * is cheap and keeps the token's color under the viewer's lights. The materials follow theme
 * changes and are disposed on unmount. Pass a constant object.
 */
export function useThemeMaterials<Key extends string>(
  tokens: Readonly<Record<Key, ThemeColorToken>>,
  { keepColor = [] }: ThemeMaterialOptions<NoInfer<Key>> = {}
): Readonly<Record<Key, MeshLambertMaterial>> {
  const colors = useThemeColors(tokens);
  const invalidate = useThree((state) => state.invalidate);
  const materials = useMemo(() => mapTokens(tokens, () => new MeshLambertMaterial()), [tokens]);
  // A string, so an inline array does not update the materials on every render.
  const kept = keepColor.join("\n");

  useLayoutEffect(() => {
    const keptKeys = new Set(kept.split("\n"));
    // SAFETY: `materials` is built by mapTokens, so its keys are exactly the Keys of `tokens`.
    for (const key of Object.keys(materials) as Key[]) {
      const material = materials[key];
      const { color, opacity } = colors[key];
      const transparent = opacity < 1;
      // A change between opaque and transparent needs a new shader program.
      if (material.transparent !== transparent) material.needsUpdate = true;
      // A kept color is emitted, not lit: every face shows exactly the token.
      const kept = keptKeys.has(key);
      material.color.copy(kept ? BLACK : color);
      material.emissive.copy(kept ? color : BLACK);
      material.opacity = opacity;
      material.transparent = transparent;
    }
    invalidate();
  }, [colors, invalidate, kept, materials]);

  // dispose() frees only the GPU copy; three uploads the material again if it is drawn later,
  // so the StrictMode unmount and remount in development stays safe.
  useEffect(
    () => () => {
      for (const material of Object.values<MeshLambertMaterial>(materials)) material.dispose();
    },
    [materials]
  );

  return materials;
}
