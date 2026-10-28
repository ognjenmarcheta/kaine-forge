import { createColorModes, type PaletteInput } from "./theme.palette";
import { typeStepNames } from "./theme.roles";
import { defaultComponents, defaultScale, defaultType } from "./theme.scale";
import type {
  NativeFonts,
  ThemeComponents,
  ThemeDefinition,
  ThemeMode,
  ThemeScale,
  ThemeType,
  TypeStepName
} from "./theme.schema";

/** Control heights and card padding. Compact still keeps every control at least 24px. */
export type Density = "compact" | "default" | "comfortable";
/** How cards stand off the page: a soft shadow, or the border alone. */
export type Depth = "shadow" | "border";

export interface CreateThemeInput<Name extends string> {
  readonly name: Name;
  readonly label: string;
  readonly description: string;
  readonly color: PaletteInput;
  /** CSS font stacks. Web fonts other than Geist need their @font-face loaded by the app. */
  readonly fonts?: { readonly sans?: string; readonly heading?: string; readonly mono?: string };
  /** Mobile fonts. Without them mobile uses the platform fonts. */
  readonly nativeFonts?: Partial<NativeFonts>;
  readonly headingWeight?: number;
  readonly density?: Density;
  readonly depth?: Depth;
  /** Exact values that win over everything derived above. */
  readonly scale?: Partial<ThemeScale>;
  readonly components?: Partial<ThemeComponents>;
  readonly modes?: { readonly light?: Partial<ThemeMode>; readonly dark?: Partial<ThemeMode> };
}

const densityScale: Record<Density, Partial<ThemeScale>> = {
  compact: {
    "control-small": "26px",
    "control-medium": "28px",
    "control-large": "36px",
    "control-xlarge": "44px"
  },
  default: {},
  comfortable: {
    "control-small": "32px",
    "control-medium": "36px",
    "control-large": "44px",
    "control-xlarge": "52px"
  }
};

const densityPadding: Record<Density, string> = {
  compact: "var(--ds-space-150)",
  default: "var(--ds-space-200)",
  comfortable: "var(--ds-space-300)"
};

function withHeadingWeight(weight: number | undefined): ThemeType {
  if (weight === undefined) {
    return defaultType;
  }

  const steps: Partial<Record<TypeStepName, ThemeType[TypeStepName]>> = {};
  for (const name of typeStepNames) {
    const step = defaultType[name];
    steps[name] = step.family === "heading" ? { ...step, weight } : step;
  }

  // SAFETY: the loop above assigns every name in typeStepNames, the full key set of ThemeType.
  return steps as ThemeType;
}

/**
 * Builds a theme from a brand color and a few axes, starting from the template defaults.
 * The colors come from `createColorModes`, so every contrast pair passes by construction.
 */
export function createTheme<const Name extends string>(
  input: CreateThemeInput<Name>
): ThemeDefinition<Name> {
  const density = input.density ?? "default";
  const colors = createColorModes(input.color);
  const fonts: Partial<ThemeScale> = {
    ...(input.fonts?.sans === undefined ? {} : { "font-family-sans": input.fonts.sans }),
    ...(input.fonts?.heading === undefined ? {} : { "font-family-heading": input.fonts.heading }),
    ...(input.fonts?.mono === undefined ? {} : { "font-family-mono": input.fonts.mono })
  };

  return {
    name: input.name,
    label: input.label,
    description: input.description,
    scale: { ...defaultScale, ...densityScale[density], ...fonts, ...input.scale },
    type: withHeadingWeight(input.headingWeight),
    components: {
      ...defaultComponents,
      "card-padding": densityPadding[density],
      ...(input.depth === "border" ? { "card-shadow": "none" } : {}),
      ...input.components
    },
    nativeFonts: { sans: "system", heading: "system", mono: "system-mono", ...input.nativeFonts },
    modes: {
      light: { ...colors.light, ...input.modes?.light },
      dark: { ...colors.dark, ...input.modes?.dark }
    }
  };
}
