// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterMenu } from "./filter-menu";

const options = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" }
] as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The menu measures its trigger to place itself; jsdom has no ResizeObserver.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function renderMenu(onValueChange: (value: "7d" | "30d") => void = () => undefined) {
  act(() =>
    root.render(
      <FilterMenu label="Period" onValueChange={onValueChange} options={options} value="7d" />
    )
  );
  const trigger = container.querySelector("button");
  if (trigger === null) throw new Error("No trigger button");
  return trigger;
}

/** The name `aria-labelledby` gives: the referenced texts, joined by spaces. */
function labelledByName(element: Element): string | undefined {
  return element
    .getAttribute("aria-labelledby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");
}

function radio(label: string): HTMLElement {
  const match = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')).find(
    (item) => item.textContent === label
  );
  if (match === undefined) throw new Error(`No option named ${label}`);
  return match;
}

describe("FilterMenu", () => {
  it("names the button by the filter and then the value it shows (WCAG 2.2 SC 2.5.3)", () => {
    const trigger = renderMenu();

    expect(labelledByName(trigger)).toBe("Period Last 7 days");
  });

  it("checks the current option and reports the option the person picks", () => {
    const onValueChange = vi.fn<(value: "7d" | "30d") => void>();
    const trigger = renderMenu(onValueChange);

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(radio("Last 7 days").getAttribute("aria-checked")).toBe("true");
    expect(radio("Last 30 days").getAttribute("aria-checked")).toBe("false");

    act(() => radio("Last 30 days").click());

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("30d");
  });
});
