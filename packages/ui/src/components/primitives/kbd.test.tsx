// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kbd } from "./kbd";

const shortcut = { apple: "⌘K", other: "Ctrl K" };

let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function onPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

describe("Kbd", () => {
  it.each([
    ["MacIntel", "⌘K"],
    ["iPhone", "⌘K"],
    ["Win32", "Ctrl K"],
    ["Linux x86_64", "Ctrl K"]
  ])("on %s shows the shortcut as %s", (platform, text) => {
    onPlatform(platform);
    const root = createRoot(container);

    act(() => root.render(<Kbd shortcut={shortcut} />));

    expect(container.textContent).toBe(text);
    act(() => root.unmount());
  });

  it("server-renders the other platform's text and hydrates on an Apple device without a mismatch", async () => {
    onPlatform("MacIntel");
    const markup = renderToString(<Kbd shortcut={shortcut} />);
    const recoverableErrors: unknown[] = [];
    container.innerHTML = markup;

    expect(container.textContent).toBe("Ctrl K");

    const root = await act(async () =>
      hydrateRoot(container, <Kbd shortcut={shortcut} />, {
        onRecoverableError: (error) => recoverableErrors.push(error)
      })
    );

    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toBe("⌘K");
    act(() => root.unmount());
  });
});
