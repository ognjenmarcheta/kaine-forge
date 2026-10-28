import { useContext } from "react";

import { ThemeContext } from "../providers/theme.provider";
import type { ThemeMode } from "../stores/theme.store";

interface UseThemeValue {
  isHydrating: boolean;
  resolvedTheme: "dark" | "light";
  setThemeMode: (mode: ThemeMode) => void;
  setThemeName: (name: string | null) => void;
  themeMode: ThemeMode;
  themeName: string;
}

export function useTheme(): UseThemeValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
