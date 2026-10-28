import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Skeleton } from "../primitives/skeleton";

export interface StatCardProps {
  className?: string;
  href?: string;
  label: string;
  /** Pass `undefined` while the count loads; a skeleton holds its place. */
  value: number | undefined;
  /** Renders `href` with the app router's link, as `NavMain` does. Defaults to a plain anchor. */
  renderLink?: (href: string, content: React.ReactNode) => React.ReactElement;
}

export function StatCard({ className, href, label, renderLink, value }: StatCardProps) {
  const content = (
    <>
      <span className="ui-stat-card__label">{label}</span>
      {value === undefined ? (
        <Skeleton aria-hidden="true" className="ui-stat-card__skeleton" />
      ) : (
        <span className="ui-stat-card__value">{value}</span>
      )}
    </>
  );
  const classes = cn("ui-stat-card", className);

  if (href === undefined)
    return (
      <div aria-busy={value === undefined} className={classes}>
        {content}
      </div>
    );
  if (renderLink)
    return (
      <Slot.Root aria-busy={value === undefined} className={classes}>
        {renderLink(href, content)}
      </Slot.Root>
    );
  return (
    <a aria-busy={value === undefined} className={classes} href={href}>
      {content}
    </a>
  );
}
