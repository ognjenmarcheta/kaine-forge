import { forwardRef, type ElementRef, type ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

import { Text } from "./text";
import { cn } from "../../lib/cn";
import { buttonTextVariants, buttonVariants } from "../../lib/variants";

export type ButtonProps = Omit<PressableProps, "children"> & {
  appearance?: "danger" | "default" | "ghost" | "secondary" | "subtle" | "warning";
  children: ReactNode;
  spacing?: "compact" | "default" | "spacious";
  textClassName?: string;
};

export const Button = forwardRef<ElementRef<typeof Pressable>, ButtonProps>(
  ({ appearance, children, className, disabled, spacing, textClassName, ...props }, ref) => (
    <Pressable
      ref={ref}
      className={cn(
        buttonVariants({ appearance, spacing }),
        disabled && "bg-ds-bg-neutral",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {typeof children === "string" ? (
        <Text
          className={cn(
            buttonTextVariants({ appearance, spacing }),
            disabled && "text-ds-text-disabled",
            textClassName
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  )
);
Button.displayName = "Button";
