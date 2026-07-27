import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { buttonVariants } from "../../lib/variants";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  appearance?: "danger" | "default" | "ghost" | "link" | "secondary" | "subtle" | "warning";
  asChild?: boolean;
  spacing?: "compact" | "default" | "spacious";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, appearance, className, spacing, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";

    return (
      <Comp
        className={cn(buttonVariants({ appearance, spacing }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
