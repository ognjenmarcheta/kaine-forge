// @vitest-environment jsdom
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
});
