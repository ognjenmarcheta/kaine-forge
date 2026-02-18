import { create } from "zustand";

interface SidebarStore {
  isDrawerOpen: boolean;
  setIsDrawerOpen: (value: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isDrawerOpen: false,
  setIsDrawerOpen: (value) => {
    set({ isDrawerOpen: value });
  }
}));
