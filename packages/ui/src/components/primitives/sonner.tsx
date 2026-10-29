import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "../../lib/cn";

export function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      closeButton
      richColors
      theme="system"
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast: "border border-ds-border bg-ds-surface-overlay text-ds-text shadow-overlay",
          description: "text-ds-text-subtle",
          actionButton: "bg-ds-bg-brand-bold text-ds-text-brand-inverse",
          cancelButton: "bg-ds-bg-neutral-subtle text-ds-text",
          ...toastOptions?.classNames
        }
      }}
      className={cn("ui-toaster", className)}
      {...props}
    />
  );
}
