import { type VariantProps } from "class-variance-authority";
import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";

import { cn } from "../../lib/cn";
import { textVariants } from "../../lib/variants";

export type TextProps = NativeTextProps &
  VariantProps<typeof textVariants> & {
    className?: string | undefined;
  };

export function Text({ className, variant, ...props }: TextProps) {
  return <NativeText className={cn(textVariants({ variant }), className)} {...props} />;
}
