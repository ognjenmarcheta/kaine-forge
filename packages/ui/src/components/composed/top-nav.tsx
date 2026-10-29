import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";

export interface TopNavItem {
  /** The page the person is on: the link gets `aria-current="page"` and the selected pill. */
  current?: boolean;
  href: string;
  /** A decorative icon before the label. */
  icon?: React.ReactNode;
  label: string;
}

export interface TopNavProps {
  /** The current page's pill: `subtle` (default) is the selected tint, `filled` the bold selected fill. */
  appearance?: "filled" | "subtle";
  className?: string;
  /** `equal` gives every link the same width, with its label centered. Defaults to `auto`. */
  itemWidth?: "auto" | "equal";
  items: readonly TopNavItem[];
  /** The navigation landmark's name, such as "Main". */
  label: string;
  /** Renders `href` with the app router's link, as `StatCard` does. Defaults to a plain anchor. */
  renderLink?: (href: string, content: React.ReactNode) => React.ReactElement;
  /** The link height, a control height step. Defaults to `medium`. On a phone every size is `xlarge` (A11Y-2). */
  size?: "large" | "medium" | "xlarge";
}

// The current page keeps the selected fill on hover and press, as selected navigation does.
// The focus ring is the shared `a:focus-visible` outline in globals.css.
const linkVariants = cva(
  "inline-flex items-center gap-ds-075 whitespace-nowrap rounded-button font-medium text-ds-text-subtle transition-colors duration-control ease-standard hover:bg-ds-bg-neutral-hovered hover:text-ds-text active:bg-ds-bg-neutral-pressed max-md:h-ds-control-xlarge",
  {
    variants: {
      appearance: {
        subtle:
          "aria-[current=page]:bg-ds-bg-selected aria-[current=page]:text-ds-text-selected aria-[current=page]:hover:bg-ds-bg-selected aria-[current=page]:hover:text-ds-text-selected",
        filled:
          "aria-[current=page]:bg-ds-bg-selected-bold aria-[current=page]:text-ds-text-brand-inverse aria-[current=page]:hover:bg-ds-bg-selected-bold aria-[current=page]:hover:text-ds-text-brand-inverse aria-[current=page]:active:bg-ds-bg-selected-bold"
      },
      itemWidth: { auto: "", equal: "w-full justify-center" },
      size: {
        medium: "h-ds-control-medium px-ds-150 text-body-sm",
        large: "h-ds-control-large px-ds-200 text-body",
        xlarge: "h-ds-control-xlarge px-ds-250 text-body"
      }
    }
  }
);

/** A horizontal row of page links, for an app with its primary navigation in the top bar. */
export function TopNav({
  appearance = "subtle",
  className,
  itemWidth = "auto",
  items,
  label,
  renderLink,
  size = "medium"
}: TopNavProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0 max-w-full", className)}>
      {/* The row scrolls inside itself on a narrow screen (RESP-1); its padding keeps the focus
          rings inside the scroll box, which clips them. Equal links share one column width, at
          least the widest label. */}
      <ul
        className={cn(
          "flex gap-ds-050 overflow-x-auto p-ds-050",
          itemWidth === "equal" && "grid auto-cols-[1fr] grid-flow-col"
        )}
      >
        {items.map((item) => {
          const content = (
            <>
              {item.icon ? (
                <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-ds-200">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </>
          );
          const linkProps = {
            "aria-current": item.current ? ("page" as const) : undefined,
            className: linkVariants({ appearance, itemWidth, size })
          };

          return (
            <li key={`${item.href} ${item.label}`} className="shrink-0">
              {renderLink ? (
                <Slot.Root {...linkProps}>{renderLink(item.href, content)}</Slot.Root>
              ) : (
                <a {...linkProps} href={item.href}>
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
