import { contrastRatio } from "./theme.color";
import { colorRoles } from "./theme.roles";
import type { ColorMode, ColorRole, ComponentTokenName, ThemeDefinition } from "./theme.schema";

/** WCAG 2.2 SC 1.4.3: text and images of text. */
export const TEXT_CONTRAST = 4.5;
/** WCAG 2.2 SC 1.4.11: focus rings, field borders, icons, and other UI graphics. */
export const GRAPHIC_CONTRAST = 3;
/** WCAG 2.2 SC 2.5.8: the smallest pointer target, in CSS pixels. */
export const MIN_TARGET_SIZE = 24;

/** A color role, or a component token whose value is a color. */
export type ColorToken = ColorRole | Extract<ComponentTokenName, "field-border">;

export interface ContrastPair {
  readonly foreground: ColorToken;
  readonly background: ColorRole;
  readonly minimum: number;
}

const pair = (foreground: ColorToken, background: ColorRole, minimum: number): ContrastPair => ({
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
  pair("text", "background-neutral", TEXT_CONTRAST),
  pair("text", "background-neutral-hovered", TEXT_CONTRAST),
  pair("text", "background-neutral-pressed", TEXT_CONTRAST),
  pair("text-subtle", "surface-raised", TEXT_CONTRAST),
  pair("text-subtle", "surface-overlay", TEXT_CONTRAST),
  pair("text-subtle", "surface-sunken", TEXT_CONTRAST),
  pair("text-subtlest", "surface-sunken-bold", TEXT_CONTRAST),
  pair("text-surface-inverse", "surface-inverse", TEXT_CONTRAST),
  pair("link", "surface", TEXT_CONTRAST),
  pair("link-pressed", "surface", TEXT_CONTRAST),
  pair("text-danger", "surface", TEXT_CONTRAST),
  pair("text-success", "surface", TEXT_CONTRAST),
  pair("text-warning", "surface", TEXT_CONTRAST),
  pair("text-information", "surface", TEXT_CONTRAST),
  pair("text-discovery", "surface", TEXT_CONTRAST),
  pair("text-brand", "surface", TEXT_CONTRAST),
  pair("text-selected", "background-selected", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold-hovered", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-brand-bold-pressed", TEXT_CONTRAST),
  pair("text-brand-inverse", "background-selected-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-neutral-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-success-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-danger-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-danger-bold-hovered", TEXT_CONTRAST),
  pair("text-inverse", "background-danger-bold-pressed", TEXT_CONTRAST),
  pair("text-inverse", "background-information-bold", TEXT_CONTRAST),
  pair("text-inverse", "background-discovery-bold", TEXT_CONTRAST),
  pair("text-warning-inverse", "background-warning-bold", TEXT_CONTRAST),
  pair("text-warning-inverse", "background-warning-bold-hovered", TEXT_CONTRAST),
  pair("text-warning-inverse", "background-warning-bold-pressed", TEXT_CONTRAST),
  pair("text-success", "background-success", TEXT_CONTRAST),
  pair("text-danger", "background-danger", TEXT_CONTRAST),
  pair("text-warning", "background-warning", TEXT_CONTRAST),
  pair("text-information", "background-information", TEXT_CONTRAST),
  pair("text-discovery", "background-discovery", TEXT_CONTRAST),
  pair("border-focused", "surface", GRAPHIC_CONTRAST),
  pair("border-focused", "surface-raised", GRAPHIC_CONTRAST),
  pair("border-focused", "surface-overlay", GRAPHIC_CONTRAST),
  pair("border-focused", "surface-sunken", GRAPHIC_CONTRAST),
  pair("border-selected", "surface", GRAPHIC_CONTRAST),
  pair("border-danger", "surface", GRAPHIC_CONTRAST),
  // Charts draw the role borders as data marks, so each one must read on the page.
  pair("border-success", "surface", GRAPHIC_CONTRAST),
  pair("border-warning", "surface", GRAPHIC_CONTRAST),
  pair("border-information", "surface", GRAPHIC_CONTRAST),
  pair("border-discovery", "surface", GRAPHIC_CONTRAST),
  pair("field-border", "surface", GRAPHIC_CONTRAST),
  pair("icon", "surface", GRAPHIC_CONTRAST),
  pair("icon-subtle", "surface", GRAPHIC_CONTRAST),
  pair("icon-danger", "surface", GRAPHIC_CONTRAST),
  pair("border-bold", "surface", GRAPHIC_CONTRAST),
  pair("border-brand", "surface", GRAPHIC_CONTRAST),
  pair("icon-brand", "surface", GRAPHIC_CONTRAST),
  pair("chart-1", "surface", GRAPHIC_CONTRAST),
  pair("chart-2", "surface", GRAPHIC_CONTRAST),
  pair("chart-3", "surface", GRAPHIC_CONTRAST),
  pair("chart-4", "surface", GRAPHIC_CONTRAST),
  pair("chart-5", "surface", GRAPHIC_CONTRAST),
  pair("chart-6", "surface", GRAPHIC_CONTRAST),
  // Cards and sunken canvases carry the same text, icons, and charts as the page.
  ...(["surface-raised", "surface-sunken"] as const).flatMap((background) => [
    pair("text-subtlest", background, TEXT_CONTRAST),
    pair("text-brand", background, TEXT_CONTRAST),
    pair("link", background, TEXT_CONTRAST),
    pair("text-success", background, TEXT_CONTRAST),
    pair("text-danger", background, TEXT_CONTRAST),
    pair("text-warning", background, TEXT_CONTRAST),
    pair("text-information", background, TEXT_CONTRAST),
    pair("text-discovery", background, TEXT_CONTRAST),
    pair("icon", background, GRAPHIC_CONTRAST),
    pair("icon-subtle", background, GRAPHIC_CONTRAST),
    // Charts draw a role series with these borders, so they hold on cards and panels too.
    pair("border-bold", background, GRAPHIC_CONTRAST),
    pair("border-brand", background, GRAPHIC_CONTRAST),
    pair("border-success", background, GRAPHIC_CONTRAST),
    pair("border-danger", background, GRAPHIC_CONTRAST),
    pair("border-warning", background, GRAPHIC_CONTRAST),
    pair("border-information", background, GRAPHIC_CONTRAST),
    pair("border-discovery", background, GRAPHIC_CONTRAST)
  ]),
  pair("chart-1", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-2", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-3", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-4", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-5", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-6", "surface-raised", GRAPHIC_CONTRAST),
  pair("chart-1", "surface-sunken", GRAPHIC_CONTRAST),
  pair("chart-2", "surface-sunken", GRAPHIC_CONTRAST),
  pair("chart-3", "surface-sunken", GRAPHIC_CONTRAST),
  pair("chart-4", "surface-sunken", GRAPHIC_CONTRAST),
  pair("chart-5", "surface-sunken", GRAPHIC_CONTRAST),
  pair("chart-6", "surface-sunken", GRAPHIC_CONTRAST)
];

const colorRoleNames: ReadonlySet<string> = new Set(colorRoles);

function isColorRole(token: string): token is ColorRole {
  return colorRoleNames.has(token);
}

/** Resolves a color token to its hex value in one mode, following var(--ds-<role>) references. */
export function resolveColor(theme: ThemeDefinition, mode: ColorMode, token: ColorToken): string {
  const value = isColorRole(token) ? theme.modes[mode][token] : theme.components[token];
  const reference = /^var\(--ds-([a-z0-9-]+)\)$/.exec(value)?.[1];

  if (reference === undefined) {
    return value;
  }
  if (!isColorRole(reference)) {
    throw new Error(
      `${theme.name}: ${token} refers to --ds-${reference}, which is not a color role`
    );
  }

  return theme.modes[mode][reference];
}

export interface ContrastResult extends ContrastPair {
  readonly mode: ColorMode;
  readonly ratio: number;
}

/** Measures every pair in both modes. Translucent fills are measured over `surface`. */
export function measureContrast(theme: ThemeDefinition): ContrastResult[] {
  return (["light", "dark"] as const).flatMap((mode) => {
    const color = (token: ColorToken): string => resolveColor(theme, mode, token);

    return contrastPairs.map((entry) => ({
      ...entry,
      mode,
      ratio: contrastRatio(color(entry.foreground), color(entry.background), color("surface"))
    }));
  });
}

export function findContrastFailures(theme: ThemeDefinition): ContrastResult[] {
  return measureContrast(theme).filter((result) => result.ratio < result.minimum);
}

/** Control heights below the WCAG 2.2 minimum target size. */
export function findTargetSizeFailures(theme: ThemeDefinition): string[] {
  return Object.entries(theme.scale)
    .filter(
      ([name, value]) => name.startsWith("control-") && Number.parseFloat(value) < MIN_TARGET_SIZE
    )
    .map(([name, value]) => `${name} is ${value}, needs at least ${MIN_TARGET_SIZE}px`);
}
