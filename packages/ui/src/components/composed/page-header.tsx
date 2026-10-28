import * as React from "react";

import { cn } from "../../lib/cn";

export interface PageHeaderProps {
  actions?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** `display` sets the title in the display type step, for a dashboard's one hero title. Defaults to `default`. */
  size?: "default" | "display";
  title: React.ReactNode;
}

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  size = "default",
  title
}: PageHeaderProps) {
  return (
    <header className={cn("ui-page-header", className)}>
      <div className="ui-page-header__heading">
        {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className={size === "display" ? "text-display" : undefined}>{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}
