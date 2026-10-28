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
  className?: string;
  items: readonly TopNavItem[];
  /** The navigation landmark's name, such as "Main". */
  label: string;
  /** Renders `href` with the app router's link, as `StatCard` does. Defaults to a plain anchor. */
  renderLink?: (href: string, content: React.ReactNode) => React.ReactElement;
}

// The current page keeps the selected fill on hover and press, as selected navigation does.
// The focus ring is the shared `a:focus-visible` outline in globals.css.
const linkClasses =
  "inline-flex h-ds-control-medium items-center gap-ds-075 whitespace-nowrap rounded-button px-ds-150 text-body-sm font-medium text-ds-text-subtle transition-colors duration-control ease-standard hover:bg-ds-bg-neutral-hovered hover:text-ds-text active:bg-ds-bg-neutral-pressed max-md:h-ds-control-xlarge aria-[current=page]:bg-ds-bg-selected aria-[current=page]:text-ds-text-selected aria-[current=page]:hover:bg-ds-bg-selected aria-[current=page]:hover:text-ds-text-selected";

/** A horizontal row of page links, for an app with its primary navigation in the top bar. */
export function TopNav({ className, items, label, renderLink }: TopNavProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0 max-w-full", className)}>
      {/* The row scrolls inside itself on a narrow screen (RESP-1); its padding keeps the focus
          rings inside the scroll box, which clips them. */}
      <ul className="flex gap-ds-050 overflow-x-auto p-ds-050">
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
            className: linkClasses
          };

          return (
            <li key={item.href} className="shrink-0">
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
