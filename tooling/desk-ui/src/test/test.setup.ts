import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// CI runs every workspace's tests at once, so a render here can take a few times longer than
// on a quiet machine. The default 1 s budget of `waitFor` and `findBy*` is too short for that.
configure({ asyncUtilTimeout: 3_000 });

// jsdom lacks these browser APIs. Radix primitives and React Flow read them.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false
});
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

afterEach(() => {
  cleanup();
});
