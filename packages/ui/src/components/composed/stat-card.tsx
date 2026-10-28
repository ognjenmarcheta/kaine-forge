import { ArrowDown, ArrowUp } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Badge } from "../primitives/badge";
import { Skeleton } from "../primitives/skeleton";

export interface StatCardDelta {
  direction: "down" | "up";
  /** The direction in words, read by screen readers, for example "Up" (COLOR-2). */
  directionLabel: string;
  /** The change as shown, for example "+12%". */
  label: string;
  /** Whether the change is good, bad, or neither. Defaults to `neutral`. */
  tone?: "danger" | "neutral" | "success";
}

interface StatCardContentProps {
  className?: string;
  /** A change badge beside the value. */
  delta?: StatCardDelta;
  /** A short note under the value, for example the period it covers. */
  description?: React.ReactNode;
  /** A decorative icon before the label. */
  icon?: React.ReactNode;
  label: string;
  /** A count, or a value the caller formats, such as "65%". Pass `undefined` while it loads; a skeleton holds its place. */
  value: React.ReactNode;
}

interface StatCardPlainProps extends StatCardContentProps {
  /** A control at the end of the header, for example a menu button. A linked card has none: a control cannot sit inside a link. */
  action?: React.ReactNode;
  href?: undefined;
  renderLink?: undefined;
}

interface StatCardLinkProps extends StatCardContentProps {
  action?: undefined;
  href: string;
  /** Renders `href` with the app router's link, as `NavMain` does. Defaults to a plain anchor. */
  renderLink?: (href: string, content: React.ReactNode) => React.ReactElement;
}

export type StatCardProps = StatCardLinkProps | StatCardPlainProps;

const deltaAppearance = {
  danger: "danger",
  neutral: "default",
  success: "success"
} as const;

export function StatCard({
  action,
  className,
  delta,
  description,
  href,
  icon,
  label,
  renderLink,
  value
}: StatCardProps) {
  const DeltaIcon = delta?.direction === "down" ? ArrowDown : ArrowUp;
  const content = (
    <>
      <div className="ui-stat-card__header">
        {icon ? (
          <span aria-hidden="true" className="ui-stat-card__icon">
            {icon}
          </span>
        ) : null}
        <span className="ui-stat-card__label">{label}</span>
        {action}
      </div>
      <div className="ui-stat-card__body">
        {value === undefined ? (
          <Skeleton aria-hidden="true" className="ui-stat-card__skeleton" />
        ) : (
          <span className="ui-stat-card__value">{value}</span>
        )}
        {delta ? (
          <Badge
            appearance={deltaAppearance[delta.tone ?? "neutral"]}
            className="relative gap-ds-050"
          >
            <DeltaIcon aria-hidden="true" className="size-ds-150 shrink-0" />
            <span className="sr-only">{delta.directionLabel}</span>
            {delta.label}
          </Badge>
        ) : null}
      </div>
      {description ? <span className="ui-stat-card__description">{description}</span> : null}
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
