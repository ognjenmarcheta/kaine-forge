import type { MenuItemConstructorOptions } from "electron";

import type { DesktopRoute } from "./navigation";

export interface BuildDesktopMenuTemplateOptions {
  onNavigate: (route: DesktopRoute) => void;
  onReload: () => void;
  onToggleDevTools: () => void;
}

export function buildDesktopMenuTemplate(
  options: BuildDesktopMenuTemplateOptions
): MenuItemConstructorOptions[] {
  return [
    {
      label: "File",
      submenu: [
        {
          accelerator: "CmdOrCtrl+R",
          click: options.onReload,
          label: "Reload"
        },
        {
          label: "Close",
          role: "close"
        }
      ]
    },
    {
      label: "Navigate",
      submenu: [
        {
          accelerator: "CmdOrCtrl+1",
          click: () => options.onNavigate("dashboard"),
          label: "Dashboard"
        },
        {
          accelerator: "CmdOrCtrl+2",
          click: () => options.onNavigate("todos"),
          label: "Todos"
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          accelerator: "Alt+CmdOrCtrl+I",
          click: options.onToggleDevTools,
          label: "Toggle Developer Tools"
        },
        {
          label: "Toggle Full Screen",
          role: "togglefullscreen"
        }
      ]
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          role: "minimize"
        },
        {
          label: "Zoom",
          role: "zoom"
        }
      ]
    }
  ];
}
