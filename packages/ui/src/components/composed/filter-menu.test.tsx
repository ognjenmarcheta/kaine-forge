// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterMenu, type FilterMenuProps } from "./filter-menu";

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

function renderMenu(
  onValueChange: (value: "7d" | "30d") => void = () => undefined,
  extra: Pick<
    FilterMenuProps<"7d" | "30d">,
    "chevron" | "icon" | "iconPlacement" | "show" | "size" | "width"
  > = {}
) {
  act(() =>
    root.render(
      <FilterMenu
        {...extra}
        label="Period"
        onValueChange={onValueChange}
        options={options}
        value="7d"
      />
    )
  );
  const trigger = container.querySelector("button");
  if (trigger === null) throw new Error("No trigger button");
  return trigger;
}

/** The text a sighted person sees: everything outside `sr-only`, `invisible`, and `aria-hidden`. */
function visibleText(element: Element): string {
  return Array.from(element.childNodes, (node) => {
    if (!(node instanceof Element)) return node.textContent ?? "";
    const hidden = /(?:^| )(?:sr-only|invisible)(?: |$)/.test(node.getAttribute("class") ?? "");
    return hidden || node.getAttribute("aria-hidden") === "true" ? "" : visibleText(node);
  }).join("");
}

function openMenu(trigger: HTMLElement) {
  act(() => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
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

  it.each([
    ["the value", {}, "Last 7 days"],
    ["a fixed label", { show: "label" }, "Period"],
    ["the widest option's width", { width: "widest" }, "Last 7 days"]
  ] as const)(
    "showing %s, keeps the filter and the chosen value in the button's name",
    (_shows, extra, visible) => {
      const trigger = renderMenu(undefined, extra);

      expect(visibleText(trigger)).toBe(visible);
      expect(labelledByName(trigger)).toBe("Period Last 7 days");
    }
  );

  it("sizes a widest button by every option, so it keeps its width when the value changes", () => {
    const trigger = renderMenu(undefined, { width: "widest" });

    expect(trigger.textContent).toBe("PeriodLast 7 daysLast 30 days");
  });

  it.each([
    [undefined, 1],
    [false, 0]
  ] as const)("with chevron %s draws %i chevrons", (chevron, count) => {
    const trigger = renderMenu(undefined, chevron === undefined ? {} : { chevron });

    expect(trigger.querySelectorAll("svg")).toHaveLength(count);
  });

  it.each([
    [undefined, ["icon", "Last 7 days", "chevron"]],
    ["end", ["Last 7 days", "icon", "chevron"]]
  ] as const)("with the icon placed %s, draws %j in that order", (iconPlacement, order) => {
    const trigger = renderMenu(undefined, {
      icon: <svg className="funnel" />,
      ...(iconPlacement ? { iconPlacement } : {})
    });
    const drawn = Array.from(trigger.children, (part) => {
      if (part.querySelector(".funnel")) return "icon";
      if (part.classList.contains("lucide-chevron-down")) return "chevron";
      return part.classList.contains("sr-only") ? "" : visibleText(part);
    }).filter((part) => part !== "");

    expect(drawn).toEqual(order);
  });

  it.each([
    [undefined, "ui-button--sm"],
    ["medium", "ui-button--md"],
    ["large", "ui-button--lg"]
  ] as const)("at size %s takes the button's %s control height", (size, spacing) => {
    const trigger = renderMenu(undefined, size ? { size } : {});

    expect(trigger.classList.contains(spacing)).toBe(true);
  });

  it("with multiple, checks every chosen option, stays open, and reports the new set in order", () => {
    const onValueChange = vi.fn<(value: ("7d" | "30d")[]) => void>();
    act(() =>
      root.render(
        <FilterMenu
          label="Period"
          multiple
          onValueChange={onValueChange}
          options={options}
          value={["30d"]}
        />
      )
    );
    const trigger = container.querySelector("button");
    if (trigger === null) throw new Error("No trigger button");

    expect(visibleText(trigger)).toBe("Period");
    expect(labelledByName(trigger)).toBe("Period Last 30 days");

    openMenu(trigger);
    const checkboxes = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]'));

    expect(checkboxes().map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true"
    ]);

    act(() => checkboxes()[0]?.click());

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(["7d", "30d"]);
    expect(checkboxes()).toHaveLength(2);
  });
});
