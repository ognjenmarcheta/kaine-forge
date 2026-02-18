import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeStore {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  setThemeMode: (mode) => {
    set({ themeMode: mode });
  },
  themeMode: "system"
}));
