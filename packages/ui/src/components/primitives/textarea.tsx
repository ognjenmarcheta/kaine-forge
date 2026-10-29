import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn("ui-textarea", className)} {...props} />;
}
