import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersistenceAdapter } from "@repo/persistence";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { useThemeStore, type ThemeMode } from "../stores/theme.store";

const THEME_STORAGE_KEY = "kaine.mobile.theme.mode";
const persistence = createAsyncStoragePersistenceAdapter(AsyncStorage);

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
  const [isHydrating, setIsHydrating] = useState(true);
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const systemTheme = useColorScheme() === "dark" ? "dark" : "light";

  useEffect(() => {
    let isActive = true;

    void (async () => {
      const stored = await persistence.getString(THEME_STORAGE_KEY);

      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeMode(stored);
      }

      if (isActive) {
        setIsHydrating(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [setThemeMode]);

  useEffect(() => {
    if (isHydrating) {
      return;
    }

    void persistence.setString(THEME_STORAGE_KEY, themeMode);
  }, [isHydrating, themeMode]);

  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

  const value = useMemo(
    () => ({
      isHydrating,
      resolvedTheme,
      setThemeMode,
      themeMode
    }),
    [isHydrating, resolvedTheme, setThemeMode, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
