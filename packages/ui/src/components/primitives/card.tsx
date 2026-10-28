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

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("grid gap-ds-050 p-card", className)} {...props} />
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

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
