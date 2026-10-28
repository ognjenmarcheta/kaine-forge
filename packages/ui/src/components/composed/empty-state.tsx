import { type LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

export interface EmptyStateProps {
  action?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  title: React.ReactNode;
}

export function EmptyState({ action, className, description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className={cn("ui-empty-state", className)}>
      {Icon ? <Icon aria-hidden="true" className="ui-empty-state__icon" /> : null}
      <p className="ui-empty-state__title">{title}</p>
      {description ? <p className="ui-empty-state__description">{description}</p> : null}
      {action ? <div className="ui-empty-state__action">{action}</div> : null}
    </div>
  );
}
