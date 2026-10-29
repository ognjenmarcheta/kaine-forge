import { ArrowDown, ArrowUp } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Badge } from "../primitives/badge";
import { Skeleton } from "../primitives/skeleton";

export interface StatCardDelta {
  /**
   * `badge` (default) is a tinted pill; `text` is the change in its tone's text color, with no
   * fill; `icon` is a round tinted chip with only the icon, and the change is read, not shown, for a
   * row that shows it elsewhere.
   */
  appearance?: "badge" | "icon" | "text";
  direction: "down" | "up";
  /** The direction in words, read by screen readers, for example "Up" (COLOR-2). */
  directionLabel: string;
  /**
   * The decorative icon before the change. Defaults to an arrow that points in `direction`; pass
   * another icon, such as a trend line or a category, or `null` for none.
   */
  icon?: React.ReactNode;
  /** The change as shown, for example "+12%". */
  label: string;
  /** Whether the change is good, bad, or neither. Defaults to `neutral`. */
  tone?: "danger" | "neutral" | "success";
}

interface StatCardContentProps {
  className?: string;
  /** A change badge beside the value. */
  delta?: StatCardDelta;
  /**
   * `below` puts the change on a line under the value, before the description; `end` puts the
   * description and then the change at the end of the value's line. Defaults to `beside`.
   */
  deltaPlacement?: "below" | "beside" | "end";
  /** A short note under the value, for example the period it covers. */
  description?: React.ReactNode;
  /** A decorative icon before the label. */
  icon?: React.ReactNode;
  /**
   * Where the icon goes: `start` (default) before the label, `end` at the end of the label row,
   * `top` on its own row above the label with the `action` at its end, or `leading`, a large icon
   * in a round well beside the label and the value.
   */
  iconPlacement?: "end" | "leading" | "start" | "top";
  label: string;
  /** A count, or a value the caller formats, such as "65%". Pass `undefined` while it loads; a skeleton holds its place. */
  value: React.ReactNode;
  /** A ring or a sparkline at the end of the value row. It brings its own name, or `aria-hidden` when the value says it all. */
  visual?: React.ReactNode;
  /** `false` keeps the value, the change beside it, and the visual on one line, for a narrow tile. */
  wrap?: boolean;
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

const deltaText = {
  danger: "text-ds-text-danger",
  neutral: "text-ds-text-subtle",
  success: "text-ds-text-success"
} as const;

function StatCardChange({ delta }: { delta: StatCardDelta }) {
  const DeltaIcon = delta.direction === "down" ? ArrowDown : ArrowUp;
  const children = (
    <>
      {delta.icon === undefined ? (
        <DeltaIcon aria-hidden="true" className="size-ds-150 shrink-0" />
      ) : delta.icon === null ? null : (
        <span aria-hidden="true" className="ui-stat-card__delta-icon">
          {delta.icon}
        </span>
      )}
      <span className="sr-only">{delta.directionLabel}</span>
      {delta.appearance === "icon" ? <span className="sr-only">{delta.label}</span> : delta.label}
    </>
  );
  const tone = delta.tone ?? "neutral";

  return delta.appearance === "text" ? (
    <span className={cn("ui-stat-card__delta", deltaText[tone])} data-slot="stat-card-delta">
      {children}
    </span>
  ) : (
    <Badge
      appearance={deltaAppearance[tone]}
      className={cn(
        "relative gap-ds-050",
        delta.appearance === "icon" && "size-ds-250 justify-center rounded-full p-ds-0"
      )}
      data-slot="stat-card-delta"
    >
      {children}
    </Badge>
  );
}

export function StatCard({
  action,
  className,
  delta,
  deltaPlacement = "beside",
  description,
  href,
  icon,
  iconPlacement = "start",
  label,
  renderLink,
  value,
  visual,
  wrap = true
}: StatCardProps) {
  const iconSlot = icon ? (
    <span aria-hidden="true" className="ui-stat-card__icon" data-slot="stat-card-icon">
      {icon}
    </span>
  ) : null;
  const change = delta ? <StatCardChange delta={delta} /> : null;
  const descriptionSlot = description ? (
    <span className="ui-stat-card__description" data-slot="stat-card-description">
      {description}
    </span>
  ) : null;
  const content = (
    <>
      {iconPlacement === "leading" ? iconSlot : null}
      <div className="ui-stat-card__header" data-slot="stat-card-header">
        {iconPlacement === "start" || iconPlacement === "top" ? iconSlot : null}
        <span className="ui-stat-card__label" data-slot="stat-card-label">
          {label}
        </span>
        {iconPlacement === "end" ? iconSlot : null}
        {action}
      </div>
      <div className="ui-stat-card__body" data-slot="stat-card-body">
        {value === undefined ? (
          <Skeleton aria-hidden="true" className="ui-stat-card__skeleton" />
        ) : (
          <span className="ui-stat-card__value" data-slot="stat-card-value">
            {value}
          </span>
        )}
        {deltaPlacement === "beside" ? change : null}
        {deltaPlacement === "end" && (change ?? descriptionSlot) ? (
          <div className="ui-stat-card__end" data-slot="stat-card-end">
            {descriptionSlot}
            {change}
          </div>
        ) : null}
        {visual ? (
          <div className="ui-stat-card__visual" data-slot="stat-card-visual">
            {visual}
          </div>
        ) : null}
      </div>
      {deltaPlacement === "below" && change ? (
        // The change and the note share one line under the value.
        <div className="ui-stat-card__footer" data-slot="stat-card-footer">
          {change}
          {descriptionSlot}
        </div>
      ) : deltaPlacement === "end" ? null : (
        descriptionSlot
      )}
    </>
  );
  const classes = cn(
    "ui-stat-card",
    iconPlacement === "leading" && iconSlot !== null && "ui-stat-card--icon-leading",
    iconPlacement === "top" && iconSlot !== null && "ui-stat-card--icon-top",
    !wrap && "ui-stat-card--nowrap",
    className
  );

  if (href === undefined)
    return (
      <div aria-busy={value === undefined} className={classes} data-slot="stat-card">
        {content}
      </div>
    );
  if (renderLink)
    return (
      <Slot.Root aria-busy={value === undefined} className={classes} data-slot="stat-card">
        {renderLink(href, content)}
      </Slot.Root>
    );
  return (
    <a aria-busy={value === undefined} className={classes} data-slot="stat-card" href={href}>
      {content}
    </a>
  );
}
