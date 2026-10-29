// @vitest-environment jsdom
import { colorRoles, contrastRatio, resolveColor, themes, type ColorRole } from "@repo/theme";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SegmentedControl, SegmentedControlItem } from "./segmented-control";

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

function radio(label: string): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]')).find(
    (item) => item.textContent === label
  );
  if (match === undefined) throw new Error(`No radio named ${label}`);
  return match;
}

const roleNames: ReadonlySet<string> = new Set(colorRoles);

/** The color role a utility sets under a variant, such as `hover:` and `text` → `text-subtle`. */
function roleOf(element: Element, variant: string, utility: "bg" | "text"): ColorRole {
  const name = (element.getAttribute("class") ?? "")
    .split(" ")
    .filter((entry) => entry.startsWith(`${variant}${utility}-ds-`))
    .map((entry) => entry.slice(`${variant}${utility}-ds-`.length).replace(/^bg-/, "background-"))
    .filter((entry) => roleNames.has(entry))
    .at(-1);
  if (name === undefined || !roleNames.has(name)) throw new Error(`No ${variant}${utility} role`);
  // SAFETY: `roleNames` holds exactly the `colorRoles` names, so the check above narrows it.
  return name as ColorRole;
}

function selectedLabels(): Array<string | null> {
  return Array.from(
    container.querySelectorAll('[role="radio"][aria-checked="true"]'),
    (item) => item.textContent
  );
}

describe("SegmentedControl", () => {
  it("selects the item an arrow key moves to and keeps it selected when it is pressed again", async () => {
    const onValueChange = vi.fn<(value: string) => void>();
    act(() =>
      root.render(
        <SegmentedControl aria-label="Range" defaultValue="week" onValueChange={onValueChange}>
          <SegmentedControlItem value="day">Day</SegmentedControlItem>
          <SegmentedControlItem value="week">Week</SegmentedControlItem>
          <SegmentedControlItem value="month">Month</SegmentedControlItem>
        </SegmentedControl>
      )
    );

    act(() => radio("Week").focus());
    await act(async () => {
      radio("Week").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
      // Radix roving focus moves focus in a timeout after the key press.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.activeElement).toBe(radio("Month"));
    expect(selectedLabels()).toEqual(["Month"]);
    expect(onValueChange).toHaveBeenLastCalledWith("month");

    act(() => radio("Month").click());

    expect(selectedLabels()).toEqual(["Month"]);
    expect(onValueChange).not.toHaveBeenCalledWith("");
  });

  it("on a brand fill, keeps each item's text at 4.5:1 at rest, on hover, and chosen", () => {
    act(() =>
      root.render(
        <SegmentedControl appearance="brand" aria-label="Direction" defaultValue="receive">
          <SegmentedControlItem value="receive">Receive</SegmentedControlItem>
          <SegmentedControlItem value="send">Send</SegmentedControlItem>
        </SegmentedControl>
      )
    );
    const control = container.firstElementChild;
    if (control === null) throw new Error("No control");
    const track = roleOf(control, "", "bg");
    const item = radio("Send");
    const chosen = roleOf(item, "data-[state=on]:", "bg");
    const pairs: Array<[ColorRole, ColorRole]> = [
      [roleOf(item, "", "text"), track],
      [roleOf(item, "hover:", "text"), track],
      [roleOf(item, "data-[state=on]:", "text"), chosen],
      [roleOf(item, "data-[state=on]:hover:", "text"), chosen]
    ];
    const lowest = Math.min(
      ...pairs.flatMap(([ink, fill]) =>
        themes.flatMap((theme) =>
          (["light", "dark"] as const).map((mode) =>
            contrastRatio(
              resolveColor(theme, mode, ink),
              resolveColor(theme, mode, fill),
              resolveColor(theme, mode, "surface")
            )
          )
        )
      )
    );

    expect(track.startsWith("background-brand-bold")).toBe(true);
    expect(lowest).toBeGreaterThanOrEqual(4.5);
  });
});
