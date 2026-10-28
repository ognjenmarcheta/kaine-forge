import type {
  colorRoles,
  componentTokenNames,
  scaleTokenNames,
  shadowRoles,
  typeStepNames
} from "./theme.roles";

export type ColorRole = (typeof colorRoles)[number];
export type ShadowRole = (typeof shadowRoles)[number];
export type ModeTokenName = ColorRole | ShadowRole;
export type ScaleTokenName = (typeof scaleTokenNames)[number];
export type TypeStepName = (typeof typeStepNames)[number];
export type ComponentTokenName = (typeof componentTokenNames)[number];
export type ColorMode = "light" | "dark";

/** One color mode: every color role as #rrggbb or #rrggbbaa, and every shadow. */
export type ThemeMode = Readonly<Record<ModeTokenName, string>>;

/** Motion, space, family, weight, border, radius, and control values shared by both modes. */
export type ThemeScale = Readonly<Record<ScaleTokenName, string>>;

export interface TypeStep {
  readonly weight: number;
  readonly size: string;
  readonly lineHeight: string;
  readonly family: "sans" | "heading" | "mono";
}

export type ThemeType = Readonly<Record<TypeStepName, TypeStep>>;

/**
 * Component tokens. A value is a length, a number, or var(--ds-<token>), so one theme value
 * can follow the other tokens, for example a card shadow that follows --ds-shadow-raised.
 */
export type ThemeComponents = Readonly<Record<ComponentTokenName, string>>;

/**
 * A font family on iOS and Android. A set names one family per weight, as the app registers
 * them with expo-font; the strings pick a platform font that needs no loading.
 */
export type NativeFontFamily =
  | "system"
  | "system-serif"
  | "system-mono"
  | {
      readonly regular: string;
      readonly medium: string;
      readonly semibold: string;
      readonly bold: string;
    };

export interface NativeFonts {
  readonly sans: NativeFontFamily;
  readonly heading: NativeFontFamily;
  readonly mono: NativeFontFamily;
}

export interface ThemeDefinition<Name extends string = string> {
  /** Stable id: written to the DOM and stored per Organization. Lowercase kebab-case. */
  readonly name: Name;
  /** Product name of the theme. It is a proper noun, so it is not translated. */
  readonly label: string;
  readonly description: string;
  readonly scale: ThemeScale;
  readonly type: ThemeType;
  readonly components: ThemeComponents;
  /** The mobile fonts. CSS font stacks do not reach React Native. */
  readonly nativeFonts: NativeFonts;
  readonly modes: Readonly<Record<ColorMode, ThemeMode>>;
}

/** Keeps the literal theme name, so the registry can derive a `ThemeName` union. */
export function defineTheme<const Name extends string>(
  theme: ThemeDefinition<Name>
): ThemeDefinition<Name> {
  return theme;
}
