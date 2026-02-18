import { Menu, type BrowserWindow } from "electron";

import { buildDesktopMenuTemplate, type BuildDesktopMenuTemplateOptions } from "./menu.template";

export function installDesktopMenu(
  window: BrowserWindow,
  options: Omit<BuildDesktopMenuTemplateOptions, "onReload" | "onToggleDevTools">
): void {
  const menu = Menu.buildFromTemplate(
    buildDesktopMenuTemplate({
      ...options,
      onReload: () => window.webContents.reload(),
      onToggleDevTools: () => window.webContents.toggleDevTools()
    })
  );

  Menu.setApplicationMenu(menu);
}
