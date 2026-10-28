import * as React from "react";

import { cn } from "../../lib/cn";
import { Button } from "../primitives/button";

export interface QueryErrorProps {
  className?: string;
  message: React.ReactNode;
  onRetry: () => void;
  retryLabel: string;
}

export function QueryError({ className, message, onRetry, retryLabel }: QueryErrorProps) {
  return (
    <div role="alert" className={cn("ui-query-error", className)}>
      <p>{message}</p>
      <Button appearance="subtle" type="button" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
