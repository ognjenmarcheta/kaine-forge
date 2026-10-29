import {
  contrastRatio,
  ensureContrast,
  fromOklch,
  shiftLightness,
  toOklch,
  withAlpha
} from "./theme.color";
import { GRAPHIC_CONTRAST, SURFACE_STEP, TEXT_CONTRAST } from "./theme.contrast";
import type { ColorMode, ShadowRole, ThemeMode } from "./theme.schema";

export interface PaletteInput {
  /** The brand color as #rrggbb. Primary actions use it as is when its text can pass contrast. */
  readonly brand: string;
  /** The tint of the grays. Without it the grays take a faint tint of the brand hue. */
  readonly neutral?: { readonly hue: number; readonly chroma: number };
  /** Status hues in OKLCH degrees, when the defaults clash with the brand. */
  readonly status?: Partial<Record<StatusName, number>>;
  /**
   * OKLCH lightness of the dark-mode page, from about 0.1 (near black) to 0.3 (charcoal).
   * The other dark surfaces step up from it. Defaults to 0.165.
   */
  readonly darkSurface?: number;
  /**
   * Strength of the brand glow, `--ds-shadow-glow`: 1 by default, 0 turns it off, 2 doubles it.
   * Light mode casts the glow below the element. Dark mode spreads it evenly and stronger,
   * because a glow on a dark page reads as light, not as a shadow.
   */
  readonly glow?: number;
}

type StatusName = "success" | "danger" | "warning" | "information" | "discovery";

const STATUS_HUES: Record<StatusName, number> = {
  success: 150,
  danger: 27,
  warning: 80,
  information: 255,
  discovery: 295
};
const WHITE = "#ffffff";

const tone = (hue: number, chroma: number, lightness: number): string =>
  fromOklch({ l: lightness, c: chroma, h: hue });

/** A fill and the text that passes on it: the fill as is when white or ink passes, else darker. */
function boldFill(seed: string, ink: string): { fill: string; text: string } {
  if (contrastRatio(WHITE, seed, seed) >= TEXT_CONTRAST) return { fill: seed, text: WHITE };
  if (contrastRatio(ink, seed, seed) >= TEXT_CONTRAST) return { fill: seed, text: ink };

  return { fill: ensureContrast(seed, WHITE, TEXT_CONTRAST), text: WHITE };
}

/** Hovered and pressed steps of a fill that keep its text passing. */
function fillStates(fill: string, text: string, delta: number): [hovered: string, pressed: string] {
  const step = (amount: number): string => {
    const shifted = shiftLightness(fill, amount);
    return contrastRatio(text, shifted, shifted) >= TEXT_CONTRAST
      ? shifted
      : shiftLightness(fill, -amount);
  };

  return [step(delta), step(delta * 2)];
}

/** An opaque background, or a translucent one over the surface under it. */
type Background = string | readonly [background: string, backdrop: string];

/** `color` moved until it reaches `minimum` on every background, all on the same side of it. */
const passingOn = (color: string, backgrounds: readonly Background[], minimum: number): string =>
  backgrounds.reduce<string>(
    (current, entry) =>
      typeof entry === "string"
        ? ensureContrast(current, entry, minimum)
        : ensureContrast(current, entry[0], minimum, entry[1]),
    color
  );

/** The shadows of one mode. The glow takes the brand fill, at a strength from 0 (off). */
function shadows(
  mode: ColorMode,
  ink: string,
  glow: { readonly color: string; readonly strength: number }
): Pick<ThemeMode, ShadowRole> {
  const glowAlpha = (value: number): string =>
    withAlpha(glow.color, Math.min(1, Math.max(0, value * glow.strength)));

  if (mode === "dark") {
    const edge = withAlpha(ink, 0.08);
    return {
      "shadow-raised": `0px 1px 2px #00000080, 0px 0px 1px ${edge}`,
      "shadow-overlay": "0px 1px 2px #00000080, 0px 12px 32px #00000073",
      "shadow-floating": "0px 2px 4px #00000080, 0px 32px 64px #00000099",
      "shadow-floating-bold": "0px 2px 4px #00000080, 0px 32px 64px #00000099",
      "shadow-glow": `0px 0px 24px ${glowAlpha(0.48)}`
    };
  }

  const alpha = (value: number): string => withAlpha(ink, value);
  return {
    "shadow-raised": `0px 1px 2px ${alpha(0.06)}, 0px 0px 1px ${alpha(0.12)}`,
    "shadow-overlay": `0px 1px 2px ${alpha(0.04)}, 0px 12px 32px ${alpha(0.08)}`,
    "shadow-floating": `0px 2px 4px ${alpha(0.04)}, 0px 32px 64px ${alpha(0.12)}`,
    "shadow-floating-bold": `0px 2px 4px ${alpha(0.04)}, 0px 32px 64px ${alpha(0.16)}`,
    "shadow-glow": `0px 4px 16px ${glowAlpha(0.32)}`
  };
}

const CHART_HUES = [255, 175, 300, 80, 145, 350, 210, 25];

/**
 * Six categorical series colors that start from the brand hue and keep the other hues apart,
 * each moved until it reaches 3:1 against every background (WCAG 2.2 SC 1.4.11), plus a grid
 * color. Pass the backgrounds nearest the series tone: the darkest in light mode, the lightest
 * in dark mode.
 */
export function createChartColors(
  brand: string,
  mode: ColorMode,
  backgrounds: readonly (string | readonly [background: string, backdrop: string])[],
  grid: string
): Pick<ThemeMode, `chart-${1 | 2 | 3 | 4 | 5 | 6}` | "chart-grid"> {
  const seed = toOklch(brand);
  const hues: number[] = [seed.h];
  const apart = (hue: number): boolean =>
    hues.every((taken) => Math.min(Math.abs(taken - hue), 360 - Math.abs(taken - hue)) >= 35);

  for (const hue of CHART_HUES) {
    if (hues.length < 6 && apart(hue)) hues.push(hue);
  }

  const series = hues.map((hue) =>
    passingOn(tone(hue, 0.14, mode === "light" ? 0.6 : 0.72), backgrounds, GRAPHIC_CONTRAST)
  );
  const [one = brand, two = brand, three = brand, four = brand, five = brand, six = brand] = series;

  return {
    "chart-1": one,
    "chart-2": two,
    "chart-3": three,
    "chart-4": four,
    "chart-5": five,
    "chart-6": six,
    "chart-grid": grid
  };
}

type Category = 1 | 2 | 3 | 4 | 5 | 6;

/** The roles `createCategoryColors` derives: the tint and the text color of each chart color. */
type CategoryRole = `background-chart-${Category}` | `text-chart-${Category}`;

type CategoryInput = Pick<
  ThemeMode,
  `chart-${Category}` | "text" | "text-subtle" | "surface" | "surface-raised" | "surface-sunken"
>;

/**
 * The pale tint and the text color of each chart color in one mode, for tiles, tags, and
 * avatars. A tint takes its chart color's hue at a fixed lightness, so a light-mode chart color
 * that darkened to reach 3:1 still gives a clean pastel. The tint moves until ink and secondary
 * text read on it. The text color is the chart color moved until it reads on its tint and on
 * every surface (WCAG 2.2 SC 1.4.3), so it also draws an icon or a mark on the tint. A tint or a text color in `fixed`
 * is kept, and the text color is derived against a fixed tint.
 */
export function createCategoryColors(
  mode: ColorMode,
  colors: CategoryInput,
  fixed: Partial<Pick<ThemeMode, CategoryRole>> = {}
): Pick<ThemeMode, CategoryRole> {
  const surfaces = [colors.surface, colors["surface-raised"], colors["surface-sunken"]];
  // Light tints sit below the white surfaces; dark tints sit above the lightest card.
  const lightness =
    mode === "light" ? 0.93 : Math.max(...surfaces.map((surface) => toOklch(surface).l)) + 0.06;
  const category = (n: Category): { tint: string; text: string } => {
    const chart = colors[`chart-${n}`];
    const { h, c } = toOklch(chart);
    const tint =
      fixed[`background-chart-${n}`] ??
      passingOn(
        tone(h, Math.min(c, mode === "light" ? 0.05 : 0.06), lightness),
        [colors.text, colors["text-subtle"]],
        TEXT_CONTRAST
      );
    const text = fixed[`text-chart-${n}`] ?? passingOn(chart, [tint, ...surfaces], TEXT_CONTRAST);

    return { tint, text };
  };
  const [one, two, three, four, five, six] = [
    category(1),
    category(2),
    category(3),
    category(4),
    category(5),
    category(6)
  ] as const;

  return {
    "background-chart-1": one.tint,
    "background-chart-2": two.tint,
    "background-chart-3": three.tint,
    "background-chart-4": four.tint,
    "background-chart-5": five.tint,
    "background-chart-6": six.tint,
    "text-chart-1": one.text,
    "text-chart-2": two.text,
    "text-chart-3": three.text,
    "text-chart-4": four.text,
    "text-chart-5": five.text,
    "text-chart-6": six.text
  };
}

/** A mode's colors with the tint and the text color of each chart color. */
const withCategoryColors = (mode: ColorMode, colors: Omit<ThemeMode, CategoryRole>): ThemeMode => ({
  ...colors,
  ...createCategoryColors(mode, colors)
});

/**
 * Derives every color role in both modes from a brand color and a neutral tint. Each role is
 * placed on a lightness target and then moved, if needed, until its contrast pairs pass, so a
 * derived theme passes `pnpm theme:check` by construction.
 */
export function createColorModes(input: PaletteInput): Record<ColorMode, ThemeMode> {
  const brand = toOklch(input.brand);
  const neutral = input.neutral ?? { hue: brand.h, chroma: Math.min(0.012, brand.c * 0.1) };
  const gray = (lightness: number, chroma = neutral.chroma): string =>
    tone(neutral.hue, chroma, lightness);
  const hue = (name: StatusName): number => input.status?.[name] ?? STATUS_HUES[name];
  const ink = gray(0.19, neutral.chroma * 1.4);
  const paper = gray(0.965, neutral.chroma * 0.6);
  const brandFill = boldFill(input.brand, ink);
  const [brandHovered, brandPressed] = fillStates(brandFill.fill, brandFill.text, -0.04);
  const glowStrength = input.glow ?? 1;

  const light = (): ThemeMode => {
    const surface = WHITE;
    const sunken = gray(0.975);
    const sunkenBold = gray(0.952);
    const neutralTrack = withAlpha(ink, 0.03);
    const pressedTrack = withAlpha(ink, 0.11);
    const grid = gray(0.925);
    const textBrand = ensureContrast(
      tone(brand.h, brand.c, Math.min(brand.l, 0.5)),
      sunken,
      TEXT_CONTRAST
    );
    const focus = ensureContrast(input.brand, sunken, GRAPHIC_CONTRAST);
    const selected = tone(brand.h, Math.min(0.045, brand.c), 0.95);
    const status = (name: StatusName) => {
      const background = tone(hue(name), 0.035, 0.965);
      const text = ensureContrast(tone(hue(name), 0.14, 0.5), background, TEXT_CONTRAST);
      const bold = ensureContrast(tone(hue(name), 0.14, 0.5), WHITE, TEXT_CONTRAST);
      return { background, text, bold };
    };
    const success = status("success");
    const danger = status("danger");
    const information = status("information");
    const discovery = status("discovery");
    const warningBackground = tone(hue("warning"), 0.05, 0.96);
    const warningText = ensureContrast(
      tone(hue("warning"), 0.12, 0.5),
      warningBackground,
      TEXT_CONTRAST
    );
    const warningBold = ensureContrast(tone(hue("warning"), 0.14, 0.8), ink, TEXT_CONTRAST);
    const [dangerHovered, dangerPressed] = fillStates(danger.bold, WHITE, -0.04);
    const [warningHovered, warningPressed] = fillStates(warningBold, ink, -0.03);
    const textSubtle = gray(0.44);
    const textSubtlest = ensureContrast(gray(0.54), sunkenBold, TEXT_CONTRAST);

    return withCategoryColors("light", {
      text: ink,
      "text-subtle": textSubtle,
      "text-subtlest": textSubtlest,
      "text-inverse": WHITE,
      "text-disabled": gray(0.62),
      "text-brand": textBrand,
      "text-success": success.text,
      "text-danger": danger.text,
      "text-warning": warningText,
      "text-warning-inverse": ink,
      "text-brand-inverse": brandFill.text,
      "text-information": information.text,
      "text-discovery": discovery.text,
      "text-selected": ensureContrast(textBrand, selected, TEXT_CONTRAST),
      "text-surface-inverse": paper,
      link: textBrand,
      "link-pressed": ensureContrast(shiftLightness(textBrand, -0.08), surface, TEXT_CONTRAST),
      icon: textSubtle,
      "icon-subtle": textSubtlest,
      // The current navigation icon also sits on the selected fill.
      "icon-brand": passingOn(input.brand, [surface, selected], GRAPHIC_CONTRAST),
      "icon-danger": danger.text,
      "background-default": surface,
      "background-neutral-subtle": "#00000000",
      "background-neutral-subtle-hovered": withAlpha(ink, 0.06),
      "background-neutral-subtle-pressed": withAlpha(ink, 0.11),
      "background-neutral": neutralTrack,
      "background-neutral-hovered": withAlpha(ink, 0.06),
      "background-neutral-pressed": pressedTrack,
      "background-neutral-bold": textSubtle,
      "background-brand-bold": brandFill.fill,
      "background-brand-bold-hovered": brandHovered,
      "background-brand-bold-pressed": brandPressed,
      "background-success": success.background,
      "background-success-bold": success.bold,
      "background-danger": danger.background,
      "background-danger-bold": danger.bold,
      "background-danger-bold-hovered": dangerHovered,
      "background-danger-bold-pressed": dangerPressed,
      "background-warning": warningBackground,
      "background-warning-bold": warningBold,
      "background-warning-bold-hovered": warningHovered,
      "background-warning-bold-pressed": warningPressed,
      "background-information": information.background,
      "background-information-bold": information.bold,
      "background-discovery": discovery.background,
      "background-discovery-bold": discovery.bold,
      "background-selected": selected,
      "background-selected-bold": brandFill.fill,
      surface,
      "surface-sunken": sunken,
      "surface-sunken-bold": sunkenBold,
      "surface-inverse": ink,
      "surface-raised": surface,
      "surface-raised-hovered": sunken,
      "surface-raised-pressed": sunkenBold,
      "surface-overlay": surface,
      border: grid,
      "border-strong": gray(0.86),
      // Graphics meet sunken areas too, the darkest light surface, so measure against them.
      "border-bold": ensureContrast(gray(0.62), sunken, GRAPHIC_CONTRAST),
      "border-focused": focus,
      "border-selected": focus,
      // Brand marks also meet the selected fill of a row.
      "border-brand": passingOn(input.brand, [sunken, selected], GRAPHIC_CONTRAST),
      "border-success": success.text,
      "border-danger": danger.text,
      "border-warning": warningText,
      "border-information": information.text,
      "border-discovery": discovery.text,
      blanket: withAlpha(ink, 0.48),
      // Charts sit on sunken areas, the darkest light surface, and on the tracks and grid there.
      ...createChartColors(
        input.brand,
        "light",
        [sunken, [neutralTrack, sunken], [pressedTrack, sunken], grid],
        grid
      ),
      ...shadows("light", ink, { color: brandFill.fill, strength: glowStrength })
    });
  };

  const dark = (): ThemeMode => {
    const base = input.darkSurface ?? 0.165;
    const step = (offset: number): string => gray(base + offset);
    const surface = step(0);
    const sunken = step(0.035);
    const sunkenBold = step(0.07);
    // A dark shadow barely shows on a dark page, so a card's lightness carries its elevation:
    // the card stands SURFACE_STEP apart from a sunken canvas, which puts it further above the
    // page. Its hovered and pressed fills, the overlays, and the borders move up with it.
    const raised = ensureContrast(step(0.055), sunken, SURFACE_STEP);
    const lift = toOklch(raised).l - toOklch(step(0.055)).l;
    const card = (offset: number): string => step(offset + lift);
    const overlay = card(0.07);
    const border = card(0.105);
    const selected = tone(brand.h, Math.min(0.05, brand.c), base + 0.095);
    const text = gray(0.965, neutral.chroma * 0.6);
    const neutralTrack = withAlpha(text, 0.06);
    const pressedTrack = withAlpha(text, 0.16);
    // The brand fill also shows a progress bar on its track on a card, the lightest place a
    // bar meets. A deep fill moves lighter until it does, while its text still passes. A fill
    // that cannot, such as an ink brand, turns light with ink text.
    const lighter = ensureContrast(brandFill.fill, neutralTrack, GRAPHIC_CONTRAST, raised);
    const fill =
      contrastRatio(lighter, neutralTrack, raised) >= GRAPHIC_CONTRAST &&
      contrastRatio(brandFill.text, lighter, lighter) >= TEXT_CONTRAST
        ? { fill: lighter, text: brandFill.text }
        : {
            // Start from a light tone of the brand hue, so the fill can only move lighter.
            fill: ensureContrast(
              tone(brand.h, brand.c, Math.max(brand.l, 0.8)),
              ink,
              TEXT_CONTRAST
            ),
            text: ink
          };
    const [fillHovered, fillPressed] = fillStates(
      fill.fill,
      fill.text,
      fill.text === WHITE ? -0.04 : 0.04
    );
    const textBrand = ensureContrast(tone(brand.h, brand.c, 0.72), overlay, TEXT_CONTRAST);
    const focus = ensureContrast(tone(brand.h, brand.c, 0.68), overlay, GRAPHIC_CONTRAST);
    const status = (name: StatusName) => {
      const background = tone(hue(name), 0.04, base + 0.075);
      const tinted = ensureContrast(tone(hue(name), 0.12, 0.78), background, TEXT_CONTRAST);
      const bold = ensureContrast(tone(hue(name), 0.12, 0.76), ink, TEXT_CONTRAST);
      return { background, text: ensureContrast(tinted, overlay, TEXT_CONTRAST), bold };
    };
    const success = status("success");
    const danger = status("danger");
    const warning = status("warning");
    const information = status("information");
    const discovery = status("discovery");
    const [dangerHovered, dangerPressed] = fillStates(danger.bold, ink, 0.04);
    const [warningHovered, warningPressed] = fillStates(warning.bold, ink, 0.04);
    // Secondary text moves up with the cards, so it keeps its contrast on tints over them.
    const textSubtle = ensureContrast(gray(0.78 + lift), overlay, TEXT_CONTRAST);
    const textSubtlest = ensureContrast(gray(0.66 + lift), overlay, TEXT_CONTRAST);

    return withCategoryColors("dark", {
      text,
      "text-subtle": textSubtle,
      "text-subtlest": textSubtlest,
      "text-inverse": ink,
      "text-disabled": gray(0.55),
      "text-brand": textBrand,
      "text-success": success.text,
      "text-danger": danger.text,
      "text-warning": warning.text,
      "text-warning-inverse": ink,
      "text-brand-inverse": fill.text,
      "text-information": information.text,
      "text-discovery": discovery.text,
      "text-selected": ensureContrast(textBrand, selected, TEXT_CONTRAST),
      "text-surface-inverse": text,
      link: textBrand,
      "link-pressed": ensureContrast(shiftLightness(textBrand, 0.08), overlay, TEXT_CONTRAST),
      icon: textSubtle,
      "icon-subtle": textSubtlest,
      "icon-brand": focus,
      "icon-danger": danger.text,
      "background-default": surface,
      "background-neutral-subtle": "#ffffff00",
      "background-neutral-subtle-hovered": withAlpha(text, 0.08),
      "background-neutral-subtle-pressed": withAlpha(text, 0.16),
      "background-neutral": neutralTrack,
      "background-neutral-hovered": withAlpha(text, 0.1),
      "background-neutral-pressed": pressedTrack,
      "background-neutral-bold": textSubtle,
      "background-brand-bold": fill.fill,
      "background-brand-bold-hovered": fillHovered,
      "background-brand-bold-pressed": fillPressed,
      "background-success": success.background,
      "background-success-bold": success.bold,
      "background-danger": danger.background,
      "background-danger-bold": danger.bold,
      "background-danger-bold-hovered": dangerHovered,
      "background-danger-bold-pressed": dangerPressed,
      "background-warning": warning.background,
      "background-warning-bold": warning.bold,
      "background-warning-bold-hovered": warningHovered,
      "background-warning-bold-pressed": warningPressed,
      "background-information": information.background,
      "background-information-bold": information.bold,
      "background-discovery": discovery.background,
      "background-discovery-bold": discovery.bold,
      "background-selected": selected,
      "background-selected-bold": fill.fill,
      surface,
      "surface-sunken": sunken,
      "surface-sunken-bold": sunkenBold,
      "surface-inverse": step(0.105),
      "surface-raised": raised,
      "surface-raised-hovered": card(0.085),
      "surface-raised-pressed": card(0.105),
      "surface-overlay": overlay,
      border,
      "border-strong": card(0.165),
      "border-bold": passingOn(gray(0.55), [overlay, selected], GRAPHIC_CONTRAST),
      "border-focused": focus,
      "border-selected": focus,
      "border-brand": focus,
      "border-success": success.text,
      "border-danger": danger.text,
      "border-warning": warning.text,
      "border-information": information.text,
      "border-discovery": discovery.text,
      blanket: "#00000099",
      // Charts sit on cards, the lightest dark surface they meet, and on the tracks and grid there.
      ...createChartColors(
        input.brand,
        "dark",
        [raised, [neutralTrack, raised], [pressedTrack, raised], border],
        border
      ),
      ...shadows("dark", text, { color: fill.fill, strength: glowStrength })
    });
  };

  return { light: light(), dark: dark() };
}
