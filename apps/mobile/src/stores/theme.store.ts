import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system" | "light-high-contrast" | "dark-high-contrast";

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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ themeMode: state.themeMode })
    }
  )
);
