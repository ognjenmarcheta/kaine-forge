import { contrastRatio } from "./theme.color";
import type { ColorMode, ColorRole, ThemeDefinition } from "./theme.schema";

/** WCAG 2.2 SC 1.4.3: text and images of text. */
export const TEXT_CONTRAST = 4.5;
/** WCAG 2.2 SC 1.4.11: focus rings, field borders, icons, and other UI graphics. */
export const GRAPHIC_CONTRAST = 3;

export interface ContrastPair {
  readonly foreground: ColorRole;
  readonly background: ColorRole;
  readonly minimum: number;
}

const pair = (foreground: ColorRole, background: ColorRole, minimum: number): ContrastPair => ({
  foreground,
  background,
  minimum
});

/** The token pairs that components put together. Every theme must pass all of them in both modes. */
export const contrastPairs: readonly ContrastPair[] = [
  pair("text", "surface", TEXT_CONTRAST),
  pair("text", "surface-sunken", TEXT_CONTRAST),
  pair("text", "surface-raised", TEXT_CONTRAST),
  pair("text", "surface-overlay", TEXT_CONTRAST),
  pair("text-subtle", "surface", TEXT_CONTRAST),
  pair("text-subtlest", "surface", TEXT_CONTRAST),
  pair("text-subtlest", "surface-sunken", TEXT_CONTRAST),
  pair("text", "surface-sunken-bold", TEXT_CONTRAST),
  pair("text-subtlest", "surface-sunken-bold", TEXT_CONTRAST),
  pair("text-surface-inverse", "surface-inverse", TEXT_CONTRAST),
  pair("link", "surface", TEXT_CONTRAST),
  pair("text-brand", "surface", TEXT_CONTRAST),
  pair("text-selected", "background-selected", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold-hovered", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold-pressed", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-selected-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-neutral-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-success-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-danger-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-information-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-discovery-bold", TEXT_CONTRAST),
  pair("text-warning-inverse", "background-warning-bold", TEXT_CONTRAST),
  pair("text-success", "background-success", TEXT_CONTRAST),
  pair("text-danger", "background-danger", TEXT_CONTRAST),
  pair("text-warning", "background-warning", TEXT_CONTRAST),
  pair("text-information", "background-information", TEXT_CONTRAST),
  pair("border-focused", "surface", GRAPHIC_CONTRAST),
  pair("border-bold", "surface", GRAPHIC_CONTRAST),
  pair("border-brand", "surface", GRAPHIC_CONTRAST),
  pair("icon-brand", "surface", GRAPHIC_CONTRAST)
];

export interface ContrastResult extends ContrastPair {
  readonly mode: ColorMode;
  readonly ratio: number;
}

/** Measures every pair in both modes. Translucent fills are measured over `surface`. */
export function measureContrast(theme: ThemeDefinition): ContrastResult[] {
  return (["light", "dark"] as const).flatMap((mode) => {
    const colors = theme.modes[mode];

    return contrastPairs.map((entry) => ({
      ...entry,
      mode,
      ratio: contrastRatio(colors[entry.foreground], colors[entry.background], colors.surface)
    }));
  });
}

export function findContrastFailures(theme: ThemeDefinition): ContrastResult[] {
  return measureContrast(theme).filter((result) => result.ratio < result.minimum);
}
