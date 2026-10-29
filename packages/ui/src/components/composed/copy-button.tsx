import { Check, Copy } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { Button } from "../primitives/button";

const COPIED_MS = 1500;

export interface CopyButtonProps {
  className?: string;
  copiedLabel: string;
  label: string;
  /**
   * Hidden text after the visible label that tells this button apart from the other copy buttons
   * on the page, such as the name of the item. The accessible name is the label, a space, and
   * this text, so it still starts with the visible label (WCAG 2.2 SC 2.5.3).
   */
  labelSuffix?: string;
  value: string;
}

export function CopyButton({ className, copiedLabel, label, labelSuffix, value }: CopyButtonProps) {
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
        {labelSuffix ? <span className="sr-only"> {labelSuffix}</span> : null}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </>
  );
}
