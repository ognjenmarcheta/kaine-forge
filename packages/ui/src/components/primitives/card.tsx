import * as React from "react";

import { cn } from "../../lib/cn";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-card border border-ds-border bg-ds-surface-raised text-ds-text shadow-card",
        className
      )}
      {...props}
    />
  );
}

/**
 * The title and description; with a `CardAction`, they take the start column and the action the
 * end. A `CardIcon` first takes a column before them. In a card marked `@container/card`, the
 * action moves under the title when the card is narrower than 24rem, so it never squeezes it.
 */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid gap-x-ds-150 gap-y-ds-050 p-card has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]",
        "has-data-[slot=card-icon]:grid-cols-[auto_minmax(0,1fr)] has-data-[slot=card-icon]:has-data-[slot=card-action]:grid-cols-[auto_minmax(0,1fr)_auto]",
        // In a narrow card, an action that wraps moves under the title; `wrap={false}` stays.
        "@max-sm/card:has-[[data-slot=card-action]:not([data-wrap=false])]:grid-cols-1 @max-sm/card:has-data-[slot=card-icon]:has-[[data-slot=card-action]:not([data-wrap=false])]:grid-cols-[auto_minmax(0,1fr)]",
        className
      )}
      {...props}
    />
  );
}

/** A decorative icon in a well before the title, which names the same thing. Put it first in a `CardHeader`. */
function CardIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="card-icon"
      className={cn(
        "row-span-2 inline-flex size-ds-500 shrink-0 items-center justify-center self-center rounded-lg bg-ds-bg-neutral text-ds-icon [&>svg]:size-ds-250",
        className
      )}
      {...props}
    />
  );
}

interface CardTitleProps extends React.ComponentProps<"h3"> {
  /** The heading level, so the title fits the page outline. Defaults to `h3`. */
  as?: "h2" | "h3" | "h4";
}

function CardTitle({ as: Heading = "h3", children, className, ...props }: CardTitleProps) {
  return (
    <Heading
      data-slot="card-title"
      className={cn("m-0 text-heading-sm text-ds-text", className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("m-0 text-body text-ds-text-subtle", className)}
      {...props}
    />
  );
}

/** One control at the end of a `CardHeader`, such as a filter menu, beside the title and description. */
function CardAction({
  className,
  wrap = true,
  ...props
}: React.ComponentProps<"div"> & {
  /** `false` keeps the action on the title row in a narrow `@container/card`, for a short control such as a period pill. */
  wrap?: boolean;
}) {
  return (
    <div
      data-slot="card-action"
      {...(wrap ? {} : { "data-wrap": "false" })}
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        "in-[[data-slot=card-header]:has(>[data-slot=card-icon])]:col-start-3",
        wrap && "@max-sm/card:col-span-full @max-sm/card:row-auto @max-sm/card:justify-self-start",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-card pb-card", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-card pb-card", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle
};
