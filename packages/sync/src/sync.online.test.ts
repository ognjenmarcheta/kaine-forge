import { describe, expect, it, vi } from "vitest";

import { createBrowserOnlineDetector } from "./sync.online";

/** A visible tab whose network the test turns off and on, as the browser does. */
function fakeWindow() {
  const target = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  const browser = {
    navigator,
    document,
    addEventListener: (type: string, listener: () => void) =>
      target.addEventListener(type, listener),
    removeEventListener: (type: string, listener: () => void) =>
      target.removeEventListener(type, listener)
  };
  const setOnline = (online: boolean) => {
    navigator.onLine = online;
    target.dispatchEvent(new Event(online ? "online" : "offline"));
  };
  return { browser, setOnline };
}

describe("createBrowserOnlineDetector", () => {
  it("reports a visible tab with no network as offline, and tells listeners each time the network changes", () => {
    const { browser, setOnline } = fakeWindow();
    const detector = createBrowserOnlineDetector(browser);
    const listener = vi.fn();
    detector.subscribe(listener);

    setOnline(false);
    expect(detector.isOnline()).toBe(false);
    setOnline(true);
    expect(detector.isOnline()).toBe(true);

    expect(listener).toHaveBeenCalledTimes(2);
    detector.dispose();
  });
});
