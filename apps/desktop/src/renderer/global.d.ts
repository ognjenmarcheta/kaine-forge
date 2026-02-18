import type { DesktopRoute } from "../main/navigation";

declare global {
  interface Window {
    desktopBridge: {
      navigate: (route: DesktopRoute) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
