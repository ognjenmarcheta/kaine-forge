import { resolveColor } from "./theme.contrast";
import { colorRoles, scaleTokenNames, shadowRoles, typeStepNames } from "./theme.roles";
import type {
  ColorMode,
  ColorRole,
  ScaleTokenName,
  ShadowRole,
  ThemeDefinition,
  TypeStep
} from "./theme.schema";

// The native desktop app (apps/desktop-native, GPUI) reads two generated files: a GPUI Kit
// ThemeSet, so the kit's components follow the theme, and the full token set for the app's own
// drawing. Both are JSON so Prettier formats them and theme:check guards them (ADR 0025).

/** CSS pixels per rem: the root font size the web app renders at. */
const ROOT_PX = 16;

/** A px or rem length as a number of device pixels. The theme scale uses no other units. */
export function toPx(value: string): number {
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!match) throw new Error(`not a px or rem length: ${value}`);
  const [, number = "0", unit] = match;
  return round(unit === "rem" ? Number(number) * ROOT_PX : Number(number));
}

const round = (value: number): number => Number(value.toFixed(3));

const scaleTokenSet: ReadonlySet<string> = new Set(scaleTokenNames);
const isScaleToken = (name: string): name is ScaleTokenName => scaleTokenSet.has(name);

/** Follows var(--ds-<scale token>) aliases to the literal value they end in. */
function resolveScale(theme: ThemeDefinition, value: string): string {
  const reference = /^var\(--ds-([a-z0-9-]+)\)$/.exec(value)?.[1];
  if (reference === undefined) return value;
  if (!isScaleToken(reference)) {
    throw new Error(`${theme.name}: ${value} does not refer to a scale token`);
  }
  return resolveScale(theme, theme.scale[reference]);
}

/** The first family of a CSS font stack, without quotes. */
export function firstFamily(stack: string): string {
  const [first = ""] = stack.split(",");
  return first.trim().replace(/^["']|["']$/g, "");
}

const shadowRoleSet: ReadonlySet<string> = new Set(shadowRoles);
const isShadowRole = (name: string): name is ShadowRole => shadowRoleSet.has(name);

/** A shadow component value for one mode: the shadow role it names, or the literal. */
function resolveShadow(theme: ThemeDefinition, mode: ColorMode, value: string): string {
  const reference = /^var\(--ds-([a-z0-9-]+)\)$/.exec(value)?.[1];
  if (reference === undefined) return value;
  if (!isShadowRole(reference)) {
    throw new Error(`${theme.name}: ${value} does not refer to a shadow role`);
  }
  return theme.modes[mode][reference];
}

/**
 * GPUI Kit colour keys and the colour role each one reads. The keys are the kit's
 * `ThemeConfigColors` serde names; the app's round-trip test proves the kit knows them.
 */
export const gpuiColorRoles = {
  background: "surface",
  foreground: "text",
  border: "border",
  ring: "border-focused",
  caret: "text",
  overlay: "blanket",
  "window.border": "border-strong",
  "drag.border": "border-brand",
  "drop_target.background": "background-selected",
  "selection.background": "background-selected",
  "primary.background": "background-brand-bold",
  "primary.hover.background": "background-brand-bold-hovered",
  "primary.active.background": "background-brand-bold-pressed",
  "primary.foreground": "text-brand-inverse",
  "secondary.background": "background-neutral",
  "secondary.hover.background": "background-neutral-hovered",
  "secondary.active.background": "background-neutral-pressed",
  "secondary.foreground": "text",
  "muted.background": "background-neutral-subtle",
  "muted.foreground": "text-subtle",
  "accent.background": "background-selected",
  "accent.foreground": "text-selected",
  "danger.background": "background-danger-bold",
  "danger.hover.background": "background-danger-bold-hovered",
  "danger.active.background": "background-danger-bold-pressed",
  "danger.foreground": "text-inverse",
  "warning.background": "background-warning-bold",
  "warning.hover.background": "background-warning-bold-hovered",
  "warning.active.background": "background-warning-bold-pressed",
  "warning.foreground": "text-warning-inverse",
  "success.background": "background-success-bold",
  "success.hover.background": "background-success-bold",
  "success.active.background": "background-success-bold",
  "success.foreground": "text-inverse",
  "info.background": "background-information-bold",
  "info.hover.background": "background-information-bold",
  "info.active.background": "background-information-bold",
  "info.foreground": "text-inverse",
  link: "link",
  "link.hover": "link-pressed",
  "link.active": "link-pressed",
  "list.background": "surface",
  "list.active.background": "background-selected",
  "list.active.border": "border-selected",
  "list.hover.background": "background-neutral-subtle-hovered",
  "list.even.background": "surface-sunken",
  "list.head.background": "surface-raised",
  "popover.background": "surface-overlay",
  "popover.foreground": "text",
  "title_bar.background": "surface-raised",
  "title_bar.border": "border",
  "status_bar.background": "surface-raised",
  "status_bar.border": "border",
  "sidebar.background": "surface-sunken",
  "sidebar.foreground": "text",
  "sidebar.border": "border",
  "sidebar.accent.background": "background-selected",
  "sidebar.accent.foreground": "text-selected",
  "sidebar.primary.background": "background-brand-bold",
  "sidebar.primary.foreground": "text-brand-inverse",
  "scrollbar.background": "surface",
  "scrollbar.thumb.background": "background-neutral-bold",
  "scrollbar.thumb.hover.background": "background-neutral-pressed",
  "skeleton.background": "background-neutral-subtle",
  "progress.bar.background": "background-brand-bold",
  "slider.background": "background-neutral",
  "slider.thumb.background": "background-brand-bold",
  "switch.background": "background-neutral-bold",
  "switch.thumb.background": "surface",
  "tab.background": "surface",
  "tab.foreground": "text-subtle",
  "tab.active.background": "surface-raised",
  "tab.active.foreground": "text",
  "tab_bar.background": "surface-sunken",
  "table.background": "surface",
  "table.head.background": "surface-raised",
  "table.head.foreground": "text-subtle",
  "table.row.border": "border",
  "table.hover.background": "background-neutral-subtle-hovered",
  "table.active.background": "background-selected",
  "table.even.background": "surface-sunken",
  "accordion.background": "surface",
  "group_box.background": "surface-raised",
  "group_box.foreground": "text",
  "group_box.title.foreground": "text-subtle",
  "description_list.label.background": "surface-sunken",
  "description_list.label.foreground": "text-subtle",
  "chart.1": "chart-1",
  "chart.2": "chart-2",
  "chart.3": "chart-3",
  "chart.4": "chart-4",
  "chart.5": "chart-5",
  "chart.grid": "chart-grid",
  "chart.bullish": "text-success",
  "chart.bearish": "text-danger",
  "base.red": "text-danger",
  "base.red.light": "background-danger",
  "base.green": "text-success",
  "base.green.light": "background-success",
  "base.yellow": "text-warning",
  "base.yellow.light": "background-warning",
  "base.blue": "text-information",
  "base.blue.light": "background-information",
  "base.magenta": "chart-5",
  "base.magenta.light": "background-chart-5",
  "base.cyan": "chart-6",
  "base.cyan.light": "background-chart-6"
} as const satisfies Record<string, ColorRole>;

/** The GPUI Kit `ThemeConfig` for one theme in one mode. */
export interface GpuiThemeConfig {
  readonly name: string;
  readonly mode: ColorMode;
  readonly is_default: boolean;
  readonly "font.size": number;
  readonly radius: number;
  readonly "radius.lg": number;
  readonly shadow: boolean;
  readonly colors: Record<string, string>;
}

export function gpuiThemeConfig(
  theme: ThemeDefinition,
  mode: ColorMode,
  isDefault: boolean
): GpuiThemeConfig {
  const colors = Object.fromEntries(
    Object.entries(gpuiColorRoles).map(([key, role]) => [key, theme.modes[mode][role]])
  );
  return {
    name: `${theme.name} ${mode}`,
    mode,
    is_default: isDefault,
    "font.size": toPx(theme.type.body.size),
    radius: Math.round(toPx(resolveScale(theme, theme.scale["radius-100"]))),
    "radius.lg": Math.round(toPx(resolveScale(theme, theme.scale["radius-200"]))),
    shadow: theme.components["card-shadow"] !== "none",
    colors: { ...colors, "input.border": resolveColor(theme, mode, "field-border") }
  };
}

/** apps/desktop-native/assets/theme/gpui-kit.json: every registered theme, light and dark. */
export function emitDesktopNativeThemeSet(
  themes: readonly ThemeDefinition[],
  defaultTheme: ThemeDefinition
): string {
  return JSON.stringify(
    {
      name: "@repo/theme",
      themes: themes.flatMap((theme) =>
        (["light", "dark"] as const).map((mode) =>
          gpuiThemeConfig(theme, mode, theme === defaultTheme)
        )
      )
    },
    null,
    2
  );
}

const byPrefix = (theme: ThemeDefinition, prefix: string): Record<string, string> =>
  Object.fromEntries(
    scaleTokenNames
      .filter((name) => name.startsWith(prefix))
      .map((name) => [name.slice(prefix.length), resolveScale(theme, theme.scale[name])])
  );

const mapValues = <T>(
  record: Record<string, string>,
  convert: (value: string) => T
): Record<string, T> =>
  Object.fromEntries(Object.entries(record).map(([key, value]) => [key, convert(value)]));

function typeStep(step: TypeStep): Record<string, number | string> {
  const size = toPx(step.size);
  const lineHeight = /(px|rem)$/.test(step.lineHeight)
    ? toPx(step.lineHeight)
    : round(Number(step.lineHeight) * size);
  const spacing = step.letterSpacing ?? "0";
  const letterSpacing = spacing.endsWith("em")
    ? round(Number.parseFloat(spacing) * size)
    : spacing === "0"
      ? 0
      : toPx(spacing);
  return { size, lineHeight, weight: step.weight, family: step.family, letterSpacing };
}

/** The colours and shadows of one theme in one mode. */
export interface DesktopNativeMode {
  readonly colors: Record<string, string>;
  readonly shadows: Record<string, string>;
  readonly fieldBorder: string;
  readonly cardShadow: string;
}

/** One theme's tokens in device pixels, numbers and family names. */
export interface DesktopNativeTheme {
  readonly label: string;
  readonly space: Record<string, number>;
  readonly radius: Record<string, number>;
  readonly control: Record<string, number>;
  readonly borderWidth: Record<string, number>;
  readonly fontWeight: Record<string, number>;
  readonly lineHeight: Record<string, number>;
  readonly letterSpacingHeading: number;
  readonly fontFamily: { readonly sans: string; readonly heading: string; readonly mono: string };
  readonly type: Record<string, Record<string, number | string>>;
  readonly motion: {
    readonly control: number;
    readonly overlay: number;
    readonly drawer: number;
    readonly easing: number[];
    readonly dialogDistance: number;
    readonly menuDistance: number;
    readonly pressScale: number;
  };
  readonly components: Record<string, number>;
  readonly modes: { readonly light: DesktopNativeMode; readonly dark: DesktopNativeMode };
}

export function desktopNativeTheme(theme: ThemeDefinition): DesktopNativeTheme {
  const scale = (name: ScaleTokenName): string => resolveScale(theme, theme.scale[name]);
  const radius = byPrefix(theme, "radius-");
  // radius-round is 50%, a shape rule rather than a length; native code uses the pill radius.
  delete radius.round;
  const borderWidth = byPrefix(theme, "border-width");
  const easing =
    scale("motion-easing")
      .match(/-?\d*\.?\d+/g)
      ?.map(Number) ?? [];
  const mode = (name: ColorMode): DesktopNativeMode => ({
    colors: Object.fromEntries(colorRoles.map((role) => [role, theme.modes[name][role]])),
    shadows: Object.fromEntries(shadowRoles.map((role) => [role, theme.modes[name][role]])),
    fieldBorder: resolveColor(theme, name, "field-border"),
    cardShadow: resolveShadow(theme, name, theme.components["card-shadow"])
  });

  return {
    label: theme.label,
    space: mapValues(byPrefix(theme, "space-"), toPx),
    radius: mapValues(radius, toPx),
    control: mapValues(byPrefix(theme, "control-"), toPx),
    borderWidth: mapValues(
      Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => [
          key === "" ? "default" : key.slice(1),
          value
        ])
      ),
      toPx
    ),
    fontWeight: mapValues(byPrefix(theme, "font-weight-"), Number),
    lineHeight: mapValues(byPrefix(theme, "line-height-"), Number),
    letterSpacingHeading: Number.parseFloat(scale("letter-spacing-heading")),
    fontFamily: {
      sans: firstFamily(scale("font-family-sans")),
      heading: firstFamily(scale("font-family-heading")),
      mono: firstFamily(scale("font-family-mono"))
    },
    type: Object.fromEntries(typeStepNames.map((name) => [name, typeStep(theme.type[name])])),
    motion: {
      control: Number.parseInt(scale("motion-control"), 10),
      overlay: Number.parseInt(scale("motion-overlay"), 10),
      drawer: Number.parseInt(scale("motion-drawer"), 10),
      easing,
      dialogDistance: toPx(scale("motion-distance-dialog")),
      menuDistance: toPx(scale("motion-distance-menu")),
      pressScale: Number.parseFloat(scale("motion-press-scale"))
    },
    components: {
      buttonRadius: toPx(resolveScale(theme, theme.components["button-radius"])),
      buttonFontWeight: Number(resolveScale(theme, theme.components["button-font-weight"])),
      fieldRadius: toPx(resolveScale(theme, theme.components["field-radius"])),
      cardRadius: toPx(resolveScale(theme, theme.components["card-radius"])),
      cardPadding: toPx(resolveScale(theme, theme.components["card-padding"])),
      overlayRadius: toPx(resolveScale(theme, theme.components["overlay-radius"])),
      dialogRadius: toPx(resolveScale(theme, theme.components["dialog-radius"])),
      badgeRadius: toPx(resolveScale(theme, theme.components["badge-radius"]))
    },
    modes: { light: mode("light"), dark: mode("dark") }
  };
}

/** apps/desktop-native/assets/theme/tokens.json: every registered theme's tokens, resolved. */
export function emitDesktopNativeTokens(
  themes: readonly ThemeDefinition[],
  defaultTheme: ThemeDefinition
): string {
  return JSON.stringify(
    {
      default: defaultTheme.name,
      themes: Object.fromEntries(themes.map((theme) => [theme.name, desktopNativeTheme(theme)]))
    },
    null,
    2
  );
}
