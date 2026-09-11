import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { useThemeStore, type ThemeMode } from "../stores/theme.store";

interface ThemeContextValue {
  isHydrating: boolean;
  resolvedTheme: "dark" | "light";
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [isHydrating, setIsHydrating] = useState(() => !useThemeStore.persist.hasHydrated());
  const [hasAppliedTheme, setHasAppliedTheme] = useState(false);
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const systemTheme = useSystemColorScheme() === "dark" ? "dark" : "light";
  const { setColorScheme } = useNativeWindColorScheme();

  useEffect(() => {
    if (useThemeStore.persist.hasHydrated()) {
      setIsHydrating(false);
    }

    return useThemeStore.persist.onFinishHydration(() => {
      setIsHydrating(false);
    });
  }, []);

  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

  // NativeWind darkMode: "class" — drive utility + CSS variable remapping from resolved theme.
  useEffect(() => {
    if (isHydrating) {
      return;
    }

    setColorScheme(resolvedTheme);
    setHasAppliedTheme(true);
  }, [isHydrating, resolvedTheme, setColorScheme]);

  const value = useMemo(
    () => ({
      isHydrating: isHydrating || !hasAppliedTheme,
      resolvedTheme,
      setThemeMode,
      themeMode
    }),
    [hasAppliedTheme, isHydrating, resolvedTheme, setThemeMode, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
