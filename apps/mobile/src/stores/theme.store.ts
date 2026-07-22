import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncZustandJsonStorage } from "@repo/persistence";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

/** Single persistence key for mobile theme mode (not shared with web). */
export const MOBILE_THEME_STORAGE_KEY = "kaine.mobile.theme.mode";

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
      name: MOBILE_THEME_STORAGE_KEY,
      storage: createAsyncZustandJsonStorage(AsyncStorage),
      partialize: (state) => ({ themeMode: state.themeMode })
    }
  )
);
