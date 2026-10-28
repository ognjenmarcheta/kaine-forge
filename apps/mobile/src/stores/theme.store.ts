import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncZustandJsonStorage } from "@repo/persistence";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

/** Single persistence key for mobile theme mode (not shared with web). */
export const MOBILE_THEME_STORAGE_KEY = "kaine.mobile.theme.mode";

interface ThemeStore {
  setThemeMode: (mode: ThemeMode) => void;
  setThemeName: (name: string | null) => void;
  themeMode: ThemeMode;
  /** The last Organization Theme, cached so the next launch paints with it. */
  themeName: string | null;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeMode: "system",
      themeName: null,
      setThemeMode: (mode) => set({ themeMode: mode }),
      setThemeName: (name) => set({ themeName: name })
    }),
    {
      name: MOBILE_THEME_STORAGE_KEY,
      storage: createAsyncZustandJsonStorage(AsyncStorage),
      partialize: (state) => ({ themeMode: state.themeMode, themeName: state.themeName })
    }
  )
);
