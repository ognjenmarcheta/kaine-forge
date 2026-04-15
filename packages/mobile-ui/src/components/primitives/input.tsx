import { forwardRef, type ElementRef } from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "../../lib/cn";

export type InputProps = TextInputProps & {
  className?: string;
};

export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  ({ className, placeholderTextColor, ...props }, ref) => (
    <TextInput
      ref={ref}
      className={cn(
        "min-h-10 rounded-md border border-ds-border bg-ds-bg px-3 py-2 text-base text-ds-text",
        className
      )}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  )
);
Input.displayName = "Input";
