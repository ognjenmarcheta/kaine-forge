import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";
import { buttonVariants } from "../../lib/variants";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: "primary" | "subtle";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, intent, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ intent, size }), className)} {...props} />;
}
