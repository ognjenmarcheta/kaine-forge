import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      closeButton
      richColors
      theme="system"
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] text-[color:var(--ds-text)] shadow-[var(--ds-shadow-overlay)]",
          description: "text-[color:var(--ds-text-subtle)]",
          actionButton: "bg-[var(--ds-background-brand-bold)] text-[color:var(--ds-text-inverse)]",
          cancelButton: "bg-[var(--ds-background-neutral-subtle)] text-[color:var(--ds-text)]",
          ...toastOptions?.classNames
        }
      }}
      {...(className ? { className } : {})}
      {...props}
    />
  );
}
