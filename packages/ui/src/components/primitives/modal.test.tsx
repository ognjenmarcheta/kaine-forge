// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from "./alert-dialog";
import { Button } from "./button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Modal, resolveModalSizeClass } from "./modal";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";

describe("resolveModalSizeClass", () => {
  it("returns expected class for configured sizes", () => {
    expect(resolveModalSizeClass("sm")).toBe("ui-modal__content--sm");
    expect(resolveModalSizeClass("md")).toBe("ui-modal__content--md");
    expect(resolveModalSizeClass("lg")).toBe("ui-modal__content--lg");
    expect(resolveModalSizeClass("xl")).toBe("ui-modal__content--xl");
    expect(resolveModalSizeClass("full")).toBe("ui-modal__content--full");
  });

  it("falls back to md when size is omitted", () => {
    expect(resolveModalSizeClass()).toBe("ui-modal__content--md");
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The menus measure their trigger to place themselves; jsdom has no ResizeObserver.
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

function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  });
}

/** The element matching `selector` whose text is `name`. */
function named(selector: string, name: string): HTMLElement {
  const match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.textContent === name || element.getAttribute("aria-label") === name
  );
  if (match === undefined) throw new Error(`No ${selector} named ${name}`);
  return match;
}

/** Lets Radix finish: it moves focus on close in a timeout. */
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

type Dialog = (open: boolean, setOpen: (open: boolean) => void) => ReactNode;

const modal: Dialog = (open, setOpen) => (
  <Modal open={open} onOpenChange={setOpen} title="Rename" />
);

/** A dialog that a menu item opens; the menu itself is `menu(open)`. */
function MenuDialog({
  dialog = modal,
  menu
}: {
  dialog?: Dialog;
  menu: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {menu(() => setOpen(true))}
      {dialog(open, setOpen)}
    </>
  );
}

const dropdown = (open: () => void) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button>Opener</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onSelect={open}>Rename</DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onSelect={open}>Rename deeper</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
);

describe("dialog focus return", () => {
  it.each([
    {
      name: "a menu item returns it to the menu's trigger",
      menu: dropdown,
      pick: (opener: HTMLElement) => {
        press(opener, "Enter");
        return named('[role="menuitem"]', "Rename");
      }
    },
    {
      name: "a sub-menu item returns it to the outer menu's trigger",
      menu: dropdown,
      pick: (opener: HTMLElement) => {
        press(opener, "Enter");
        const more = named('[role="menuitem"]', "More");
        act(() => more.focus());
        press(more, "ArrowRight");
        return named('[role="menuitem"]', "Rename deeper");
      }
    },
    {
      name: "a context menu item returns it to the element focused before the menu",
      menu: (open: () => void) => (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Button>Opener</Button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={open}>Rename</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ),
      pick: (opener: HTMLElement) => {
        act(() => {
          opener.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        });
        return named('[role="menuitem"]', "Rename");
      }
    }
  ])("on close, a Modal opened from $name", async ({ menu, pick }) => {
    act(() => root.render(<MenuDialog menu={menu} />));
    const opener = named("button", "Opener");
    act(() => opener.focus());

    const item = pick(opener);
    act(() => item.focus());
    press(item, "Enter");
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => named("button", "Close").click());
    await settle();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    {
      name: "AlertDialog",
      close: "Cancel",
      dialog: ((open, setOpen) => (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Delete</AlertDialogTitle>
            <AlertDialogDescription>It goes for good.</AlertDialogDescription>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )) satisfies Dialog
    },
    {
      name: "Sheet",
      close: "Close",
      dialog: ((open, setOpen) => (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent closeLabel="Close">
            <SheetTitle>Details</SheetTitle>
            <SheetDescription>More about it.</SheetDescription>
          </SheetContent>
        </Sheet>
      )) satisfies Dialog
    }
  ])(
    "on close, $name opened from a menu item returns it to the menu's trigger",
    async ({ close, dialog }) => {
      act(() => root.render(<MenuDialog dialog={dialog} menu={dropdown} />));
      const opener = named("button", "Opener");
      act(() => opener.focus());
      press(opener, "Enter");
      const item = named('[role="menuitem"]', "Rename");
      act(() => item.focus());
      press(item, "Enter");
      await settle();

      act(() => named("button", close).click());
      await settle();

      expect(document.activeElement).toBe(opener);
    }
  );
});
