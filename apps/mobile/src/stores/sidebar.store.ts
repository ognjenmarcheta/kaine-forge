import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarStore {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (value: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      isDrawerOpen: false,
      setIsDrawerOpen: (value) => set({ isDrawerOpen: value })
    }),
    {
      name: "kaine.sidebar.state",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ isDrawerOpen: state.isDrawerOpen })
    }
  )
);
