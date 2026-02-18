import { create } from "zustand";

interface SidebarStore {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const SIDEBAR_STORAGE_KEY = "kaine.sidebar.collapsed";

function getInitialSidebarValue(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  isCollapsed: getInitialSidebarValue(),
  toggleSidebar: () => {
    set((state) => {
      const nextValue = !state.isCollapsed;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, nextValue ? "1" : "0");
      }

      return {
        isCollapsed: nextValue
      };
    });
  }
}));
