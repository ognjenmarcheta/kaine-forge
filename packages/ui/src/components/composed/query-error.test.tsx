// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryError } from "./query-error";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("QueryError", () => {
  it("announces the message as an alert and retries on click", () => {
    const onRetry = vi.fn();
    act(() =>
      root.render(
        <QueryError message="Could not load todos" retryLabel="Retry" onRetry={onRetry} />
      )
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Could not load todos");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry"
    );
    act(() => retry?.click());

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
