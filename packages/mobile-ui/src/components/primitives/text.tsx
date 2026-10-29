import { type VariantProps } from "class-variance-authority";
import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";

import { useThemeFonts } from "./theme-root";
import { cn } from "../../lib/cn";
import { fontFamilyForClassName } from "../../lib/fonts";
import { textVariants } from "../../lib/variants";

export type TextProps = NativeTextProps &
  VariantProps<typeof textVariants> & {
    className?: string | undefined;
  };

export function Text({ className, variant, style, ...props }: TextProps) {
  const classes = cn(textVariants({ variant }), className);
  const fonts = useThemeFonts();
  const fontFamily = fontFamilyForClassName(
    classes,
    variant === "heading" || variant === "subheading" ? fonts.heading : fonts.sans
  );

  // A registered family carries its weight in its name; a synthetic fontWeight makes Android
  // fall back to the system font. The platform font reads the weight class itself.
  return (
    <NativeText
      className={classes}
      style={[fontFamily === undefined ? null : { fontFamily, fontWeight: "normal" }, style]}
      {...props}
    />
  );
}
