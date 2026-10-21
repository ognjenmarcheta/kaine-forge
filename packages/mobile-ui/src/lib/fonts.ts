// Font family names the app registers with expo-font. React Native picks a custom font
// by family name, not by fontWeight, so each Geist weight is its own family.
export const fontFamilies = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular"
} as const;

export function fontFamilyForClassName(className: string): string {
  const weight = className.match(/\bfont-(bold|semibold|medium)\b/)?.[1];

  return weight === "bold" || weight === "semibold" || weight === "medium"
    ? fontFamilies[weight]
    : fontFamilies.regular;
}
