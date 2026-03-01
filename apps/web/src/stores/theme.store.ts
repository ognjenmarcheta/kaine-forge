import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeStore {
  setThemeMode: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeMode: "system" as ThemeMode,
      setThemeMode: (mode) => set({ themeMode: mode })
    }),
    {
      name: "kaine.theme.mode",
      partialize: (state) => ({ themeMode: state.themeMode })
    }
  )
);
