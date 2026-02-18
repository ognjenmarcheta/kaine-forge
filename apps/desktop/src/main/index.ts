import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { registerDesktopIpc } from "./ipc";
import { installDesktopMenu } from "./menu";
import { normalizeBaseRendererUrl } from "./navigation";
import { createDesktopWindow, navigateDesktopWindow } from "./window";

const currentDir = dirname(fileURLToPath(import.meta.url));

function resolvePackagedRendererUrl(): string {
  const webEntry = join(currentDir, "../../../web/dist/index.html");
  return pathToFileURL(webEntry).toString();
}

function getBaseRendererUrl(): string {
  if (app.isPackaged) {
    return normalizeBaseRendererUrl(process.env.DESKTOP_WEB_URL ?? resolvePackagedRendererUrl());
  }

  return normalizeBaseRendererUrl(process.env.DESKTOP_WEB_URL ?? "http://localhost:3000");
}

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  const baseRendererUrl = getBaseRendererUrl();
  const preloadPath = join(currentDir, "../preload/index.js");

  mainWindow = await createDesktopWindow({
    baseRendererUrl,
    preloadPath
  });

  installDesktopMenu(mainWindow, {
    onNavigate: (route) => {
      if (mainWindow) {
        void navigateDesktopWindow(mainWindow, baseRendererUrl, route);
      }
    }
  });

  registerDesktopIpc({
    baseRendererUrl,
    window: mainWindow
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
