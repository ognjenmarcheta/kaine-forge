import { createContext, useEffect, useMemo, type ReactNode } from "react";

import { useThemeStore, type ThemeMode } from "../stores/theme.store";

interface ThemeContextValue {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = mode === "system" ? resolveSystemTheme() : mode;
  document.documentElement.dataset.theme = resolved;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const listener = () => {
      if (themeMode === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", listener);

    return () => {
      media.removeEventListener("change", listener);
    };
  }, [themeMode]);

  const value = useMemo(
    () => ({
      setThemeMode,
      themeMode
    }),
    [setThemeMode, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
