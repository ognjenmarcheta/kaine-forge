// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchTrigger } from "./search-trigger";

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

/** The text a screen reader reads: everything outside `aria-hidden`. */
function readText(element: Element): string {
  return Array.from(element.childNodes, (node) => {
    if (node instanceof Element)
      return node.getAttribute("aria-hidden") === "true" ? "" : readText(node);
    return node.textContent ?? "";
  }).join("");
}

describe("SearchTrigger", () => {
  it("is a button named by its visible text that opens the menu without submitting its form", () => {
    const onClick = vi.fn<() => void>();
    const onSubmit = vi.fn<() => void>();
    act(() =>
      root.render(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <SearchTrigger
            label="Search clients"
            onClick={onClick}
            shortcut={{ apple: "⌘K", other: "Ctrl K" }}
          />
        </form>
      )
    );
    const button = container.querySelector("button");
    if (button === null) throw new Error("No button");

    expect(readText(button)).toBe("Search clients");
    expect(button.textContent).toBe("Search clientsCtrl K");

    act(() => button.click());

    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("with show icon, draws only the magnifier and keeps the label as its name", () => {
    act(() =>
      root.render(
        <SearchTrigger label="Search" shortcut={{ apple: "⌘K", other: "Ctrl K" }} show="icon" />
      )
    );
    const button = container.querySelector("button");
    if (button === null) throw new Error("No button");

    expect(readText(button)).toBe("Search");
    expect(button.textContent).toBe("Search");
    expect(button.querySelector(".ui-search-trigger__label")?.classList.contains("sr-only")).toBe(
      true
    );
    expect(button.classList.contains("ui-search-trigger--icon")).toBe(true);
  });
});
