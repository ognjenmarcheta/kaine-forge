import { Check, Copy } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Button } from "../primitives/button";

const COPIED_MS = 1500;

export interface CopyButtonProps {
  className?: string;
  copiedLabel: string;
  label: string;
  value: string;
}

export function CopyButton({ className, copiedLabel, label, value }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access is denied or unavailable (insecure context); keep the idle state.
      return;
    }
    clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <>
      <Button
        appearance="ghost"
        className={cn("ui-copy-button", className)}
        spacing="compact"
        type="button"
        onClick={() => void copy()}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {label}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
