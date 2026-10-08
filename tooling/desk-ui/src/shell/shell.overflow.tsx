import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui";
import { useEffect, useState, type ReactElement, type RefCallback } from "react";

/**
 * Is the element's text cut by a line clamp or an ellipsis? It checks again when the element
 * resizes and when `text` changes. Returns a ref to put on the clamped element.
 */
export function useOverflow<T extends HTMLElement>(
  text: string
): readonly [RefCallback<T>, boolean] {
  const [element, setElement] = useState<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    if (element === null) return;
    const check = (): void =>
      setOverflowing(
        element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1
      );
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, text]);
  return [setElement, overflowing] as const;
}

/**
 * The full text in a tooltip, but only when the visible text is cut: a tooltip that repeats
 * what is already on screen is noise. `children` is the one element that triggers it.
 */
export function OverflowTooltip({
  text,
  overflowing,
  children
}: {
  readonly text: string;
  readonly overflowing: boolean;
  readonly children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={overflowing && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="desk-tooltip">{text}</TooltipContent>
    </Tooltip>
  );
}
