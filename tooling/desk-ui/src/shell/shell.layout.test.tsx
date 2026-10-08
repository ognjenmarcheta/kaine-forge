import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { DeskApp } from "../desk.app";
import { fakeApi, renderDesk } from "../test/test.render";

type Listener = EventListenerOrEventListenerObject;

/** A system color scheme that a test can change while the page runs. */
const systemScheme = (dark: boolean) => {
  const listeners = new Set<Listener>();
  const state = { dark };
  const original = window.matchMedia;
  window.matchMedia = (query: string): MediaQueryList => ({
    get matches() {
      return query.includes("dark") && state.dark;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  });
  return {
    set: (next: boolean) => {
      state.dark = next;
      const change = new Event("change");
      for (const listener of listeners) {
        if (typeof listener === "function") listener(change);
        else listener.handleEvent(change);
      }
    },
    restore: () => {
      window.matchMedia = original;
    }
  };
};

const theme = (): string | undefined => document.documentElement.dataset["theme"];

const choose = async (name: string, menu = "Preferences"): Promise<void> => {
  await userEvent.click(screen.getByRole("button", { name: menu }));
  await userEvent.click(await screen.findByRole("menuitemradio", { name }));
};

afterEach(() => {
  window.localStorage.clear();
});

describe("Shell", () => {
  it("has one row of navigation pills with the current page marked", async () => {
    renderDesk(<DeskApp />, fakeApi());
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    expect(screen.getByRole("link", { name: "Board" }).getAttribute("aria-current")).toBe("page");
    expect(nav.querySelectorAll("a")).toHaveLength(2);
  });

  it("has one polite connection status and no alert banner", async () => {
    renderDesk(<DeskApp />, fakeApi());
    expect(await screen.findByRole("status", { name: "" })).toBeTruthy();
    expect(screen.getAllByText("Connecting")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("follows the system theme by default, also when it changes", async () => {
    const scheme = systemScheme(true);
    try {
      renderDesk(<DeskApp />, fakeApi());
      await screen.findByRole("button", { name: "Preferences" });
      expect(theme()).toBe("dark");
      act(() => scheme.set(false));
      expect(theme()).toBe("light");
    } finally {
      scheme.restore();
    }
  });

  it("switches light, dark, and system at once and keeps the choice", async () => {
    const scheme = systemScheme(false);
    try {
      renderDesk(<DeskApp />, fakeApi());
      await screen.findByRole("button", { name: "Preferences" });
      await choose("Dark");
      expect(theme()).toBe("dark");
      expect(window.localStorage.getItem("kaine-desk-theme")).toBe("dark");
      // A system change does not override an explicit choice.
      act(() => scheme.set(true));
      await choose("Light");
      expect(theme()).toBe("light");
      await choose("System");
      expect(theme()).toBe("dark");
      expect(window.localStorage.getItem("kaine-desk-theme")).toBe("system");
    } finally {
      scheme.restore();
    }
  });

  it("switches the language from the same menu", async () => {
    renderDesk(<DeskApp />, fakeApi());
    await screen.findByRole("button", { name: "Preferences" });
    await choose("Deutsch");
    expect(await screen.findByRole("link", { name: "Übersicht" })).toBeTruthy();
    await choose("English", "Einstellungen");
    expect(await screen.findByRole("link", { name: "Board" })).toBeTruthy();
  });
});
