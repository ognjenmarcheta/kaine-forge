import { useEffect, useState } from "react";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "kaine-desk-theme";
const NOTIFY_KEY = "kaine-desk-notify";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const isTheme = (value: string | null): value is Theme => THEMES.some((theme) => theme === value);

/** Storage can throw (private windows, blocked site data). The page works without it. */
const readStoredTheme = (): Theme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const systemIsDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

/**
 * Light, dark, or the system's choice. The stored choice wins; without one the desk follows
 * the system, also when the system changes. The resolved theme is set on the root, where the
 * tokens switch, so nothing remounts: drafts, focus, and scroll stay.
 */
export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? "system");
  const [dark, setDark] = useState(systemIsDark);

  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const update = (): void => setDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [theme]);

  const resolved = theme === "system" ? (dark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.dataset["colorMode"] = resolved;
  }, [resolved]);

  const choose = (next: Theme): void => {
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page.
    }
  };
  return [theme, choose] as const;
}

/**
 * Browser notifications when an issue reaches a gate or stops. Off until the person turns them
 * on; the choice is kept like the theme. Permission is the browser's, asked on the toggle.
 */
export function useNotifyPreference(): readonly [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(NOTIFY_KEY) === "on";
    } catch {
      return false;
    }
  });
  const choose = (next: boolean): void => {
    setOn(next);
    try {
      window.localStorage.setItem(NOTIFY_KEY, next ? "on" : "off");
    } catch {
      // The choice still applies to this page.
    }
  };
  return [on, choose] as const;
}

export const BOARD_LAYOUTS = ["turn", "columns"] as const;
export type BoardLayout = (typeof BOARD_LAYOUTS)[number];

const LAYOUT_KEY = "kaine-desk-board-layout";

const isBoardLayout = (value: string | null): value is BoardLayout =>
  BOARD_LAYOUTS.some((layout) => layout === value);

/** The board as a "Your turn" inbox or as columns. Kept like the theme; Your turn by default. */
export function useBoardLayout(): readonly [BoardLayout, (layout: BoardLayout) => void] {
  const [layout, setLayout] = useState<BoardLayout>(() => {
    try {
      const stored = window.localStorage.getItem(LAYOUT_KEY);
      return isBoardLayout(stored) ? stored : "turn";
    } catch {
      return "turn";
    }
  });
  const choose = (next: BoardLayout): void => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // The choice still applies to this page.
    }
  };
  return [layout, choose] as const;
}
