import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeStore {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

const THEME_STORAGE_KEY = "kaine.theme.mode";

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }

  return "system";
}

export const useThemeStore = create<ThemeStore>((set) => ({
  setThemeMode: (mode) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }

    set({ themeMode: mode });
  },
  themeMode: getStoredThemeMode()
}));
