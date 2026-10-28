/** Whether the device is an Apple one, where the command key replaces Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
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

/** Cmd+K on Apple devices and Ctrl+K elsewhere; never while an IME composes text. */
export function isCommandMenuShortcut(event: KeyboardEvent, applePlatform: boolean): boolean {
  const modifier = applePlatform
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return (
    !event.isComposing &&
    modifier &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}
