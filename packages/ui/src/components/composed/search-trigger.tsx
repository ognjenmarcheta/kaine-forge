import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "../primitives/button";
import { Kbd, type KbdShortcut } from "../primitives/kbd";

export interface SearchTriggerProps extends Omit<
  ButtonProps,
  "appearance" | "asChild" | "children" | "spacing"
> {
  /** `outline` (default) draws the field border, so the button looks like a search field. */
  appearance?: "ghost" | "outline" | "raised" | "subtle";
  /** The visible text, such as "Search…". It is also the button's name (FORM-1). */
  label: string;
  /**
   * The shortcut hint at the end, such as `{ apple: "⌘K", other: "Ctrl K" }`. Screen readers skip
   * it; give them the keys with `aria-keyshortcuts`, which `useApplePlatform` helps to pick.
   */
  shortcut?: KbdShortcut;
  /**
   * `icon` draws only the magnifier in a square button, with the label as its hidden name and no
   * shortcut hint, for a narrow bar. Defaults to `label`.
   */
  show?: "icon" | "label";
  /** The height: `default` is the medium control, `compact` and `spacious` the steps around it. */
  spacing?: "compact" | "default" | "spacious";
}

/**
 * A button that looks like a search field and opens a `CommandMenu`. It is a button, not a field:
 * its visible text names it, and the menu holds the real search input.
 */
export const SearchTrigger = React.forwardRef<HTMLButtonElement, SearchTriggerProps>(
  (
    {
      appearance = "outline",
      className,
      label,
      shortcut,
      show = "label",
      type = "button",
      ...props
    },
    ref
  ) => (
    <Button
      ref={ref}
      appearance={appearance}
      className={cn("ui-search-trigger", show === "icon" && "ui-search-trigger--icon", className)}
      type={type}
      {...props}
    >
      <Search aria-hidden="true" className="ui-search-trigger__icon" />
      <span className={cn("ui-search-trigger__label", show === "icon" && "sr-only")}>{label}</span>
      {shortcut && show === "label" ? (
        <Kbd aria-hidden="true" className="ui-search-trigger__shortcut" shortcut={shortcut} />
      ) : null}
    </Button>
  )
);
SearchTrigger.displayName = "SearchTrigger";
