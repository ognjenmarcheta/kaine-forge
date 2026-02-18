import { ipcMain, shell, type BrowserWindow } from "electron";

import type { DesktopRoute } from "./navigation";
import { navigateDesktopWindow } from "./window";

interface RegisterDesktopIpcOptions {
  baseRendererUrl: string;
  window: BrowserWindow;
}

export function registerDesktopIpc(options: RegisterDesktopIpcOptions): void {
  ipcMain.handle("desktop:navigate", async (_event, route: DesktopRoute) => {
    await navigateDesktopWindow(options.window, options.baseRendererUrl, route);
  });

  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });
}
