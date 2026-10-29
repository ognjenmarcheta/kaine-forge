import { contrastRatio } from "./theme.color";
import { colorRoles } from "./theme.roles";
import type { ColorMode, ColorRole, ComponentTokenName, ThemeDefinition } from "./theme.schema";

/** WCAG 2.2 SC 1.4.3: text and images of text. */
export const TEXT_CONTRAST = 4.5;
/** WCAG 2.2 SC 1.4.11: focus rings, field borders, icons, and other UI graphics. */
export const GRAPHIC_CONTRAST = 3;
/** WCAG 2.2 SC 2.5.8: the smallest pointer target, in CSS pixels. */
export const MIN_TARGET_SIZE = 24;
/**
 * A dark card against the page and a sunken canvas. It is not a WCAG ratio: a dark shadow barely
 * shows on a dark page, so the lightness step carries the card's elevation. Light mode, where
 * the shadow or the border does that, measures about 1.08:1 from a card to the sunken canvas.
 */
export const SURFACE_STEP = 1.1;

/** A color role, or a component token whose value is a color. */
export type ColorToken = ColorRole | Extract<ComponentTokenName, "field-border">;

export interface ContrastPair {
  readonly foreground: ColorToken;
  readonly background: ColorRole;
  readonly minimum: number;
  /** The surface under a translucent background, such as a track on a card. Default `surface`. */
  readonly backdrop?: ColorRole;
  /** The one color mode the pair applies to. Without it, the pair applies to both. */
  readonly onlyIn?: ColorMode;
}

const pair = (foreground: ColorToken, background: ColorRole, minimum: number): ContrastPair => ({
  foreground,
  background,
  minimum
});

const categories = [1, 2, 3, 4, 5, 6] as const;

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
  // Raised and outline buttons keep ink text on the raised hover and pressed fills.
  pair("text", "surface-raised-hovered", TEXT_CONTRAST),
  pair("text", "surface-raised-pressed", TEXT_CONTRAST),
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
  pair("chart-6", "surface-sunken", GRAPHIC_CONTRAST),
  // A chart color's tint carries ink, secondary text, and its text color, which also draws an
  // icon or a mark on the tint. The chart color is not measured there, so a theme can set a
  // mid-tone pastel. The text color also reads on every surface, for a tag or a label.
  ...categories.flatMap((n) => [
    pair("text", `background-chart-${n}`, TEXT_CONTRAST),
    pair("text-subtle", `background-chart-${n}`, TEXT_CONTRAST),
    pair(`text-chart-${n}`, `background-chart-${n}`, TEXT_CONTRAST),
    ...(["surface", "surface-raised", "surface-sunken"] as const).map((background) =>
      pair(`text-chart-${n}`, background, TEXT_CONTRAST)
    )
  ])
];

const chartRoles = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;

/** A fill on a translucent track, measured with the track on the page, a card, and a well. */
const onTrack = (fill: ColorRole, track: ColorRole): ContrastPair[] =>
  (["surface", "surface-raised", "surface-sunken"] as const).map((backdrop) => ({
    ...pair(fill, track, GRAPHIC_CONTRAST),
    backdrop
  }));

/**
 * Every pair a theme must pass to ship: `contrastPairs`, plus the tracks and tints that the
 * components draw and the step from a dark card to the surfaces under it. Lab themes never ship,
 * so the lab measures them against `contrastPairs` only.
 */
export const shippedThemePairs: readonly ContrastPair[] = [
  ...contrastPairs,
  // Progress bars draw chart fills on the neutral track, on the page, a card, or a sunken area.
  // Gauges draw them on chart-grid.
  ...chartRoles.flatMap((fill) => [
    ...onTrack(fill, "background-neutral"),
    pair(fill, "chart-grid", GRAPHIC_CONTRAST)
  ]),
  // Progress bars also draw the status fills on the neutral track. Warning draws in its border
  // color there: the warning fill is a light amber that carries ink text on badges and banners.
  ...(
    [
      "background-success-bold",
      "background-danger-bold",
      "border-warning",
      "background-information-bold"
    ] as const
  ).flatMap((fill) => onTrack(fill, "background-neutral")),
  // And the brand fill, which dark mode derives. Light mode keeps the brand as given for primary
  // buttons, so a light brand there can sit under 3:1 on the track.
  ...onTrack("background-brand-bold", "background-neutral").map((entry): ContrastPair => ({
    ...entry,
    onlyIn: "dark"
  })),
  // A selected row keeps its secondary text, checkboxes, and current brand icon.
  pair("text-subtle", "background-selected", TEXT_CONTRAST),
  pair("border-bold", "background-selected", GRAPHIC_CONTRAST),
  pair("border-brand", "background-selected", GRAPHIC_CONTRAST),
  pair("icon-brand", "background-selected", GRAPHIC_CONTRAST),
  ...(["surface", "surface-sunken"] as const).map((background): ContrastPair => ({
    ...pair("surface-raised", background, SURFACE_STEP),
    onlyIn: "dark"
  }))
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

/**
 * Measures each pair in its modes. A translucent background is measured over its backdrop,
 * `surface` unless the pair names another.
 */
export function measureContrast(
  theme: ThemeDefinition,
  pairs: readonly ContrastPair[] = contrastPairs
): ContrastResult[] {
  return (["light", "dark"] as const).flatMap((mode) => {
    const color = (token: ColorToken): string => resolveColor(theme, mode, token);

    return pairs
      .filter((entry) => entry.onlyIn === undefined || entry.onlyIn === mode)
      .map((entry) => ({
        ...entry,
        mode,
        ratio: contrastRatio(
          color(entry.foreground),
          color(entry.background),
          color(entry.backdrop ?? "surface")
        )
      }));
  });
}

export function findContrastFailures(
  theme: ThemeDefinition,
  pairs: readonly ContrastPair[] = contrastPairs
): ContrastResult[] {
  return measureContrast(theme, pairs).filter((result) => result.ratio < result.minimum);
}

/** A length in CSS pixels: px as written, rem at the 16px root size. */
const cssPixels = (value: string): number =>
  Number.parseFloat(value) * (value.trim().endsWith("rem") ? 16 : 1);

/** Control heights below the WCAG 2.2 minimum target size. */
export function findTargetSizeFailures(theme: ThemeDefinition): string[] {
  return Object.entries(theme.scale)
    .filter(([name, value]) => name.startsWith("control-") && cssPixels(value) < MIN_TARGET_SIZE)
    .map(([name, value]) => `${name} is ${value}, needs at least ${MIN_TARGET_SIZE}px`);
}
