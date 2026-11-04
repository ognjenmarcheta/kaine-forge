import { resolveThemeName, type ThemeName } from "@repo/theme";
import { useEffect, useState } from "react";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "kaine-desk-theme";
const THEME_NAME_KEY = "kaine-desk-theme-name";
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

const readStoredThemeName = (): ThemeName => {
  try {
    return resolveThemeName(window.localStorage.getItem(THEME_NAME_KEY));
  } catch {
    return resolveThemeName(null);
  }
};

/**
 * Which registered theme the desk wears (Byte Forge, Moss). A stored name that is no longer
 * registered falls back to the default theme. Set on the root beside the color mode.
 */
export function useThemeName(): readonly [ThemeName, (name: ThemeName) => void] {
  const [name, setName] = useState<ThemeName>(readStoredThemeName);

  useEffect(() => {
    document.documentElement.dataset["theme"] = name;
  }, [name]);

  const choose = (next: ThemeName): void => {
    setName(next);
    try {
      window.localStorage.setItem(THEME_NAME_KEY, next);
    } catch {
      // The choice still applies to this page.
    }
  };
  return [name, choose] as const;
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

/** A stored choice of a few: kept in localStorage, the first option when none is stored. */
function useStoredChoice<T extends string>(
  key: string,
  options: readonly T[],
  fallback: T
): readonly [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return options.find((option) => option === stored) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const choose = (next: T): void => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // The choice still applies to this page.
    }
  };
  return [value, choose] as const;
}

export const WORK_VIEWS = ["list", "columns"] as const;
export type WorkView = (typeof WORK_VIEWS)[number];

/** All work as one list or in columns. Kept like the theme; the list by default. */
export const useWorkView = (): readonly [WorkView, (view: WorkView) => void] =>
  useStoredChoice("kaine-desk-work-view", WORK_VIEWS, "list");

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * Comfortable or Compact, for the whole app. Set on the root beside the theme, where the
 * density tokens switch. Compact shows each item on two lines.
 */
export function useDensity(): readonly [Density, (density: Density) => void] {
  const [density, choose] = useStoredChoice("kaine-desk-density", DENSITIES, "comfortable");
  useEffect(() => {
    document.documentElement.dataset["density"] = density;
  }, [density]);
  return [density, choose] as const;
}

const HOLD_TOASTS = ["off", "on"] as const;

/**
 * Keep a message with Undo on screen while the pointer or focus is on it (WCAG 2.2.1). Off
 * by default: the message then leaves after its time.
 */
export function useHoldToasts(): readonly [boolean, (on: boolean) => void] {
  const [value, choose] = useStoredChoice("kaine-desk-hold-toasts", HOLD_TOASTS, "off");
  return [value === "on", (on: boolean) => choose(on ? "on" : "off")] as const;
}
