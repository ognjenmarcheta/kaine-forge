// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The root entry must stay free of three.js, so a page pays for it only when it shows a 3D
// view. If anything on that path imported three, loading the entry here would throw.
vi.mock("three", () => {
  throw new Error("@repo/ui-3d must not load three.js before the canvas");
});
vi.mock("@react-three/fiber", () => {
  throw new Error("@repo/ui-3d must not load React Three Fiber before the canvas");
});

const { Viewport3D } = await import("../index");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no WebGL, like a browser with WebGL turned off. Its getContext only reports
  // "not implemented" and returns null.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom has no matchMedia; the viewer asks it for reduced motion.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const labels = {
  viewer: "Body model",
  keyboardHelp: "Arrow keys turn the model.",
  controls: "View",
  rotateLeft: "Turn left",
  rotateRight: "Turn right",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Reset view"
};

it("shows the fallback and no viewer controls when the browser has no WebGL2", () => {
  act(() =>
    root.render(
      <Viewport3D
        announcement="Left forearm selected"
        fallback={<p>The 3D view is not available. Use the region list.</p>}
        labels={labels}
      >
        {null}
      </Viewport3D>
    )
  );

  expect(container.textContent).toContain("The 3D view is not available. Use the region list.");
  expect(container.querySelector('[role="region"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Zoom in"]')).toBeNull();
  // The selection is still announced: the list beside the viewer keeps working.
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(
    "Left forearm selected"
  );
});
