import { useEffect, useState } from "react";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "kaine-desk-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export const isTheme = (value: string | null): value is Theme =>
  THEMES.some((theme) => theme === value);

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
    document.documentElement.dataset["theme"] = resolved;
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
