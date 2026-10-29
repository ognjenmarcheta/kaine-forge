// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandMenu } from "./command-menu";
import { Button } from "../primitives/button";
import { Modal } from "../primitives/modal";

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

    // Ids are never matched, only labels and keywords.
    await type(input, "page");
    expect(optionLabels()).toEqual([]);
    expect(document.body.textContent).toContain("No results");

    await type(input, "note");
    expect(optionLabels()).toEqual(["Notes"]);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });

    expect(openNotes).toHaveBeenCalledOnce();
    expect(openTodos).not.toHaveBeenCalled();
  });

  it("returns focus to the element that opened it when it closes", async () => {
    const render = (open: boolean) =>
      root.render(
        <>
          <Button type="button">Search</Button>
          <CommandMenu
            emptyLabel="No results"
            groups={[
              { heading: "Go to", items: [{ id: "todos", label: "Todos", onSelect: () => {} }] }
            ]}
            label="Command menu"
            onOpenChange={() => {}}
            open={open}
            placeholder="Search"
          />
        </>
      );
    await act(async () => render(false));
    const opener = container.querySelector("button");
    if (!opener) throw new Error("the opener did not render");
    opener.focus();

    await act(async () => render(true));
    expect(document.activeElement).not.toBe(opener);

    await act(async () => render(false));
    // Radix moves focus on close in a timeout.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(opener);
  });

  /** A search button that opens the menu, a field, and a dialog; the commands focus or open them. */
  function Screen() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const field = useRef<HTMLInputElement>(null);
    return (
      <>
        <Button type="button" onClick={() => setMenuOpen(true)}>
          Search
        </Button>
        <input aria-label="Name" ref={field} />
        <CommandMenu
          emptyLabel="No results"
          groups={[
            {
              heading: "Actions",
              items: [
                {
                  id: "rename",
                  label: "Rename",
                  onSelect: () => {
                    setMenuOpen(false);
                    field.current?.focus();
                  }
                },
                {
                  id: "share",
                  label: "Share",
                  onSelect: () => {
                    setMenuOpen(false);
                    setDialogOpen(true);
                  }
                }
              ]
            }
          ]}
          label="Command menu"
          onOpenChange={setMenuOpen}
          open={menuOpen}
          placeholder="Search"
        />
        <Modal open={dialogOpen} onOpenChange={setDialogOpen} title="Share" />
      </>
    );
  }

  async function pick(label: string) {
    const search = container.querySelector("button");
    if (!search) throw new Error("the search button did not render");
    act(() => search.focus());
    await act(async () => search.click());
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(
      (element) => element.textContent === label
    );
    if (!(option instanceof HTMLElement)) throw new Error(`no command named ${label}`);
    await act(async () => option.click());
    // Radix moves focus on close in a timeout.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return search;
  }

  it("runs a command after it has closed, so the focus the command moves stays", async () => {
    await act(async () => root.render(<Screen />));

    await pick("Rename");

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('input[aria-label="Name"]'));
  });

  it("leaves a dialog that a command opens its focus, which returns to the opener after", async () => {
    await act(async () => root.render(<Screen />));

    const search = await pick("Share");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.contains(document.activeElement)).toBe(true);

    const close = dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => close?.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(search);
  });
});
