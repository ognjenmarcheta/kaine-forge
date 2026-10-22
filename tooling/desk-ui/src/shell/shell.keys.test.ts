import { afterEach, describe, expect, it, vi } from "vitest";

import { SEQUENCE_MS, createKeyHandler, type PageShortcut } from "./shell.keys";

const press = (target: Element, key: string, init: KeyboardEventInit = {}): void => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  );
};

const setup = () => {
  const openPalette = vi.fn();
  const go = vi.fn();
  const approve = vi.fn();
  const clock = { now: 1_000 };
  const shortcuts: PageShortcut[] = [{ key: "a", run: approve }];
  const handler = createKeyHandler(
    { openPalette, go },
    () => shortcuts,
    () => clock.now
  );
  document.addEventListener("keydown", handler);
  cleanups.push(() => document.removeEventListener("keydown", handler));
  return { openPalette, go, approve, clock };
};

const place = (html: string): Element => {
  document.body.innerHTML = html;
  const element = document.body.querySelector("[data-target]");
  if (element === null) throw new Error("missing target");
  return element;
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

describe("createKeyHandler", () => {
  it("runs page and global keys from the page, but not while the person types", () => {
    const keys = setup();
    press(place("<main data-target></main>"), "a");
    press(document.body, "/");
    expect(keys.approve).toHaveBeenCalledTimes(1);
    expect(keys.openPalette).toHaveBeenCalledTimes(1);

    for (const field of [
      "<input data-target />",
      "<textarea data-target></textarea>",
      "<select data-target></select>",
      '<div contenteditable="true"><p data-target>text</p></div>'
    ]) {
      const target = place(field);
      press(target, "a");
      press(target, "/");
    }
    expect(keys.approve).toHaveBeenCalledTimes(1);
    expect(keys.openPalette).toHaveBeenCalledTimes(1);
  });

  it("opens the palette with Ctrl+K or ⌘K even in a field", () => {
    const keys = setup();
    press(place("<input data-target />"), "k", { ctrlKey: true });
    press(document.body, "K", { metaKey: true });
    expect(keys.openPalette).toHaveBeenCalledTimes(2);
  });

  it("ignores single keys inside a dialog or a menu, and with a modifier key down", () => {
    const keys = setup();
    press(place('<div role="dialog"><button data-target>Ship</button></div>'), "a");
    press(place('<div role="menu"><div role="menuitem" data-target>Cancel</div></div>'), "a");
    const page = place("<main data-target></main>");
    press(page, "a", { altKey: true });
    press(page, "a", { ctrlKey: true });
    press(page, "a", { metaKey: true });
    expect(keys.approve).not.toHaveBeenCalled();
  });

  it("goes to a page with G and then B, H, or R, only within the sequence time", () => {
    const keys = setup();
    const page = place("<main data-target></main>");
    press(page, "g");
    press(page, "h");
    press(page, "g");
    press(page, "R", { shiftKey: true });
    expect(keys.go.mock.calls).toEqual([["health"], ["stats"]]);

    press(page, "g");
    keys.clock.now += SEQUENCE_MS;
    press(page, "b");
    expect(keys.go).toHaveBeenCalledTimes(2);
  });
});
