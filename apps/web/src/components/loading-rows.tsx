import { Skeleton } from "@repo/ui";

export function LoadingRows({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      role="status"
      className="grid gap-[var(--ds-space-200)]"
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-[var(--ds-space-800)] w-full" />
      ))}
    </div>
  );
}
