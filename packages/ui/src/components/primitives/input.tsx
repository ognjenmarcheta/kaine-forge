import { forwardRef, type ComponentProps } from "react";

import { cn } from "../../lib/cn";

export type InputProps = ComponentProps<"input">;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return <input className={cn("ui-input", className)} ref={ref} {...props} />;
});

Input.displayName = "Input";
