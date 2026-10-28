// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandMenu } from "./command-menu";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has neither; cmdk measures the list and scrolls the selected item.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function optionLabels(): string[] {
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (option) => option.textContent
  );
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CommandMenu", () => {
  it("narrows the items to labels and keywords matching the typed text and runs the selected one on Enter", async () => {
    const openNotes = vi.fn<() => void>();
    const openTodos = vi.fn<() => void>();
    await act(async () =>
      root.render(
        <CommandMenu
          emptyLabel="No results"
          groups={[
            {
              heading: "Go to",
              items: [
                { id: "page-todos", label: "Todos", onSelect: openTodos },
                { id: "page-notes", label: "Notes", onSelect: openNotes }
              ]
            },
            {
              heading: "Preferences",
              items: [{ id: "dark", keywords: ["Theme"], label: "Dark", onSelect: () => {} }]
            }
          ]}
          label="Command menu"
          onOpenChange={() => {}}
          open
          placeholder="Search"
        />
      )
    );
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Search"]');
    if (!input) throw new Error("the search input did not render");
    expect(optionLabels()).toEqual(["Todos", "Notes", "Dark"]);

    await type(input, "theme");
    expect(optionLabels()).toEqual(["Dark"]);

    await type(input, "note");
    expect(optionLabels()).toEqual(["Notes"]);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    expect(openNotes).toHaveBeenCalledOnce();
    expect(openTodos).not.toHaveBeenCalled();

    // Ids are never matched, only labels and keywords.
    await type(input, "page");
    expect(optionLabels()).toEqual([]);
    expect(document.body.textContent).toContain("No results");
  });
});
