import * as React from "react";

import { cn } from "../../lib/cn";

/** The text of a shortcut that uses the command modifier, for each kind of platform. */
export interface KbdShortcut {
  /** Shown on Apple devices, such as "⌘K". */
  apple: string;
  /** Shown on other devices and in server-rendered markup, such as "Ctrl K". */
  other: string;
}

type KbdProps = Omit<React.ComponentProps<"kbd">, "children"> &
  (
    | { children?: React.ReactNode; shortcut?: undefined }
    | {
        children?: undefined;
        /** Picks the text by platform: ⌘ on Apple devices, Ctrl elsewhere. */
        shortcut: KbdShortcut;
      }
  );

function isApplePlatform(): boolean {
  // `userAgentData` is not in every browser nor in the DOM typings yet.
  const userAgentData = "userAgentData" in navigator ? navigator.userAgentData : undefined;
  const platform =
    typeof userAgentData === "object" &&
    userAgentData !== null &&
    "platform" in userAgentData &&
    typeof userAgentData.platform === "string"
      ? userAgentData.platform
      : navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

// The platform never changes while the page is open, so there is nothing to subscribe to.
const subscribe = () => () => undefined;

/**
 * Whether the device is an Apple one, where the command key replaces Ctrl. The server cannot
 * know, so it and the hydrating render say `false`; an Apple device re-renders after hydration.
 */
export function useApplePlatform(): boolean {
  return React.useSyncExternalStore(subscribe, isApplePlatform, () => false);
}

function ShortcutText({ shortcut }: { shortcut: KbdShortcut }) {
  return useApplePlatform() ? shortcut.apple : shortcut.other;
}

/** A keyboard key hint, such as the K in a Cmd+K shortcut. */
function Kbd({ children, className, shortcut, ...props }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex items-center justify-center rounded-sm border border-ds-border bg-ds-surface-sunken px-ds-050 font-mono text-body-xs text-ds-text-subtle",
        className
      )}
      {...props}
    >
      {shortcut ? <ShortcutText shortcut={shortcut} /> : children}
    </kbd>
  );
}

export { Kbd };
export type { KbdProps };
