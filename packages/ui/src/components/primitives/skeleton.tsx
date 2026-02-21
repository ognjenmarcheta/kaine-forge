import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-[var(--ds-background-neutral)] animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
