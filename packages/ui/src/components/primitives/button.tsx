import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { buttonVariants } from "../../lib/variants";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `outline` is a surface fill with a bold border, for a raised button on a tinted area. */
  appearance?:
    "danger" | "default" | "ghost" | "link" | "outline" | "secondary" | "subtle" | "warning";
  asChild?: boolean;
  /** `icon` is a square at the default control height for an icon alone; name it with `aria-label`. */
  spacing?: "compact" | "default" | "icon" | "spacious";
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
