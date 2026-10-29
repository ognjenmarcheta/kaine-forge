import { Platform } from "react-native";

/**
 * A font family from a theme: one registered family per weight, or a platform font. React
 * Native picks a custom font by family name, not by fontWeight, so each weight is its own family.
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

const platformFamilies = {
  system: undefined,
  "system-serif": Platform.OS === "ios" ? "Georgia" : "serif",
  "system-mono": Platform.OS === "ios" ? "Menlo" : "monospace"
} as const;

/** The family for a class list, or undefined for the platform font, which reads fontWeight itself. */
export function fontFamilyForClassName(
  className: string,
  family: NativeFontFamily
): string | undefined {
  if (typeof family === "string") {
    return platformFamilies[family];
  }

  const weight = className.match(/\bfont-(bold|semibold|medium)\b/)?.[1];

  return weight === "bold" || weight === "semibold" || weight === "medium"
    ? family[weight]
    : family.regular;
}
