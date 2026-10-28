import {
  contrastRatio,
  ensureContrast,
  fromOklch,
  shiftLightness,
  toOklch,
  withAlpha
} from "./theme.color";
import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from "./theme.contrast";
import type { ColorMode, ShadowRole, ThemeMode } from "./theme.schema";

export interface PaletteInput {
  /** The brand color as #rrggbb. Primary actions use it as is when its text can pass contrast. */
  readonly brand: string;
  /** The tint of the grays. Without it the grays take a faint tint of the brand hue. */
  readonly neutral?: { readonly hue: number; readonly chroma: number };
  /** Status hues in OKLCH degrees, when the defaults clash with the brand. */
  readonly status?: Partial<Record<StatusName, number>>;
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

function shadows(mode: ColorMode, ink: string): Pick<ThemeMode, ShadowRole> {
  if (mode === "dark") {
    const edge = withAlpha(ink, 0.08);
    return {
      "shadow-raised": `0px 1px 2px #00000080, 0px 0px 1px ${edge}`,
      "shadow-overlay": "0px 1px 2px #00000080, 0px 12px 32px #00000073",
      "shadow-floating": "0px 2px 4px #00000080, 0px 32px 64px #00000099",
      "shadow-floating-bold": "0px 2px 4px #00000080, 0px 32px 64px #00000099"
    };
  }

  const alpha = (value: number): string => withAlpha(ink, value);
  return {
    "shadow-raised": `0px 1px 2px ${alpha(0.06)}, 0px 0px 1px ${alpha(0.12)}`,
    "shadow-overlay": `0px 1px 2px ${alpha(0.04)}, 0px 12px 32px ${alpha(0.08)}`,
    "shadow-floating": `0px 2px 4px ${alpha(0.04)}, 0px 32px 64px ${alpha(0.12)}`,
    "shadow-floating-bold": `0px 2px 4px ${alpha(0.04)}, 0px 32px 64px ${alpha(0.16)}`
  };
}

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

  const light = (): ThemeMode => {
    const surface = WHITE;
    const sunken = gray(0.975);
    const sunkenBold = gray(0.952);
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

    return {
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
      "icon-brand": ensureContrast(input.brand, surface, GRAPHIC_CONTRAST),
      "icon-danger": danger.text,
      "background-default": surface,
      "background-neutral-subtle": "#00000000",
      "background-neutral-subtle-hovered": withAlpha(ink, 0.06),
      "background-neutral-subtle-pressed": withAlpha(ink, 0.11),
      "background-neutral": withAlpha(ink, 0.03),
      "background-neutral-hovered": withAlpha(ink, 0.06),
      "background-neutral-pressed": withAlpha(ink, 0.11),
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
      border: gray(0.925),
      "border-strong": gray(0.86),
      "border-bold": ensureContrast(gray(0.62), surface, GRAPHIC_CONTRAST),
      "border-focused": focus,
      "border-selected": focus,
      "border-brand": ensureContrast(input.brand, surface, GRAPHIC_CONTRAST),
      "border-success": success.text,
      "border-danger": danger.text,
      "border-warning": warningText,
      "border-information": information.text,
      "border-discovery": discovery.text,
      blanket: withAlpha(ink, 0.48),
      ...shadows("light", ink)
    };
  };

  const dark = (): ThemeMode => {
    const surface = gray(0.165);
    const sunken = gray(0.2);
    const sunkenBold = gray(0.235);
    const overlay = gray(0.235);
    const text = gray(0.965, neutral.chroma * 0.6);
    const textBrand = ensureContrast(tone(brand.h, brand.c, 0.72), overlay, TEXT_CONTRAST);
    const focus = ensureContrast(tone(brand.h, brand.c, 0.68), overlay, GRAPHIC_CONTRAST);
    const selected = tone(brand.h, Math.min(0.05, brand.c), 0.26);
    const status = (name: StatusName) => {
      const background = tone(hue(name), 0.04, 0.24);
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
    const textSubtle = gray(0.78);
    const textSubtlest = ensureContrast(gray(0.66), sunkenBold, TEXT_CONTRAST);

    return {
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
      "text-brand-inverse": brandFill.text,
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
      "background-neutral": withAlpha(text, 0.06),
      "background-neutral-hovered": withAlpha(text, 0.1),
      "background-neutral-pressed": withAlpha(text, 0.16),
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
      "background-warning": warning.background,
      "background-warning-bold": warning.bold,
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
      "surface-inverse": gray(0.27),
      "surface-raised": sunken,
      "surface-raised-hovered": sunkenBold,
      "surface-raised-pressed": gray(0.26),
      "surface-overlay": overlay,
      border: gray(0.27),
      "border-strong": gray(0.33),
      "border-bold": ensureContrast(gray(0.55), overlay, GRAPHIC_CONTRAST),
      "border-focused": focus,
      "border-selected": focus,
      "border-brand": focus,
      "border-success": success.text,
      "border-danger": danger.text,
      "border-warning": warning.text,
      "border-information": information.text,
      "border-discovery": discovery.text,
      blanket: "#00000099",
      ...shadows("dark", text)
    };
  };

  return { light: light(), dark: dark() };
}
