import * as React from "react";

import { cn } from "../../lib/cn";

export interface SettingsSectionProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: React.ReactNode;
}

/** A flat, full-width settings block. Consecutive sections are split by a divider, never a Card. */
export function SettingsSection({
  actions,
  children,
  className,
  description,
  title
}: SettingsSectionProps) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className={cn("ui-settings-section", className)}>
      <div className="ui-settings-section__header">
        <div className="ui-settings-section__heading">
          <h2 id={headingId}>{title}</h2>
          {description ? <p className="ui-settings-section__description">{description}</p> : null}
        </div>
        {actions ? <div className="ui-settings-section__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
