// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./copy-button";

let container: HTMLDivElement;
let root: Root;
let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function liveRegion() {
  return container.querySelector('[aria-live="polite"]')?.textContent;
}

describe("CopyButton", () => {
  it("writes the value to the clipboard and announces the copied state until it resets", async () => {
    act(() => root.render(<CopyButton value="ABCD-1234" label="Copy" copiedLabel="Copied" />));
    expect(liveRegion()).toBe("");

    await act(async () => container.querySelector("button")?.click());

    expect(writeText).toHaveBeenCalledWith("ABCD-1234");
    expect(liveRegion()).toBe("Copied");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(liveRegion()).toBe("");
  });

  it("tells copy buttons apart by hidden text after the visible label (WCAG 2.2 SC 2.5.3)", () => {
    act(() =>
      root.render(
        <>
          <CopyButton copiedLabel="Copied" label="Copy link" labelSuffix="Q3 report" value="a" />
          <CopyButton copiedLabel="Copied" label="Copy link" labelSuffix="Q4 report" value="b" />
        </>
      )
    );

    // The icons carry no text, so the text content is the name a screen reader reads.
    expect(
      Array.from(container.querySelectorAll("button"), (button) => button.textContent)
    ).toEqual(["Copy link Q3 report", "Copy link Q4 report"]);
  });

  it("stays idle when the clipboard rejects the write", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    act(() => root.render(<CopyButton value="ABCD-1234" label="Copy" copiedLabel="Copied" />));

    await act(async () => container.querySelector("button")?.click());

    expect(liveRegion()).toBe("");
  });
});
