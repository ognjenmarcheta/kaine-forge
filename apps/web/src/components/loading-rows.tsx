import { Skeleton } from "@repo/ui";

export function LoadingRows({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status" className="grid gap-ds-200">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-ds-800 w-full" />
      ))}
    </div>
  );
}
