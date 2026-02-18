import { contextBridge, ipcRenderer } from "electron";

import type { DesktopRoute } from "../main/navigation";

contextBridge.exposeInMainWorld("desktopBridge", {
  navigate: (route: DesktopRoute) => ipcRenderer.invoke("desktop:navigate", route),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url)
});
