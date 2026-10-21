import { type VariantProps } from "class-variance-authority";
import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";

import { cn } from "../../lib/cn";
import { fontFamilyForClassName } from "../../lib/fonts";
import { textVariants } from "../../lib/variants";

export type TextProps = NativeTextProps &
  VariantProps<typeof textVariants> & {
    className?: string | undefined;
  };

export function Text({ className, variant, style, ...props }: TextProps) {
  const classes = cn(textVariants({ variant }), className);

  // The weight lives in the family name; a synthetic fontWeight makes Android fall back to the system font.
  return (
    <NativeText
      className={classes}
      style={[{ fontFamily: fontFamilyForClassName(classes), fontWeight: "normal" }, style]}
      {...props}
    />
  );
}
