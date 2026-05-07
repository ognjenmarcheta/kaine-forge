import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncZustandJsonStorage } from "@repo/persistence";
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
      storage: createAsyncZustandJsonStorage(AsyncStorage),
      partialize: (state) => ({ themeMode: state.themeMode })
    }
  )
);
