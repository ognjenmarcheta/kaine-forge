import { createSyncZustandJsonStorage } from "@repo/persistence";
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
      themeMode: "system",
      setThemeMode: (mode) => set({ themeMode: mode })
    }),
    {
      name: "kaine.theme.mode",
      storage: createSyncZustandJsonStorage(() =>
        typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage
      ),
      partialize: (state) => ({ themeMode: state.themeMode })
    }
  )
);
