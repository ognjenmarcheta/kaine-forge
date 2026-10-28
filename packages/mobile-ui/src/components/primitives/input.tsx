import { forwardRef, type ElementRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { useThemeFonts } from "./theme-root";
import { cn } from "../../lib/cn";
import { fontFamilyForClassName } from "../../lib/fonts";

export type InputProps = TextInputProps & {
  className?: string;
};

export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  ({ className, placeholderTextColor, style, ...props }, ref) => {
    const fontFamily = fontFamilyForClassName("", useThemeFonts().sans);

    // Field borders use border-bold, so they reach 3:1 against the surface (WCAG 2.2 SC 1.4.11).
    return (
      <TextInput
        ref={ref}
        className={cn(
          "min-h-10 rounded-md border border-ds-border-bold bg-ds-bg px-3 py-2 text-base text-ds-text",
          className
        )}
        placeholderTextColor={placeholderTextColor}
        style={[fontFamily === undefined ? null : { fontFamily }, style]}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
