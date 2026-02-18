import { BrowserWindow, app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DesktopRoute } from "./navigation";
import { resolveDesktopRouteUrl } from "./navigation";

interface DesktopWindowState {
  height: number;
  isMaximized: boolean;
  width: number;
  x?: number;
  y?: number;
}

interface CreateDesktopWindowOptions {
  baseRendererUrl: string;
  preloadPath: string;
}

const WINDOW_STATE_FILE = "desktop-window-state.json";

const DEFAULT_WINDOW_STATE: DesktopWindowState = {
  height: 900,
  isMaximized: false,
  width: 1400
};

function getWindowStatePath(): string {
  return join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function parseWindowState(raw: string): DesktopWindowState {
  try {
    const parsed = JSON.parse(raw) as Partial<DesktopWindowState>;

    if (typeof parsed.width !== "number" || typeof parsed.height !== "number") {
      return DEFAULT_WINDOW_STATE;
    }

    return {
      height: parsed.height,
      isMaximized: parsed.isMaximized === true,
      width: parsed.width,
      x: parsed.x,
      y: parsed.y
    };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

function readWindowState(): DesktopWindowState {
  try {
    return parseWindowState(readFileSync(getWindowStatePath(), "utf8"));
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

function writeWindowState(window: BrowserWindow): void {
  const bounds = window.getBounds();
  const state: DesktopWindowState = {
    height: bounds.height,
    isMaximized: window.isMaximized(),
    width: bounds.width,
    x: bounds.x,
    y: bounds.y
  };

  writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2));
}

async function loadWindowUrl(window: BrowserWindow, url: string): Promise<void> {
  try {
    await window.loadURL(url);
  } catch {
    await window.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<h1>Kaine Desktop</h1><p>Web renderer not reachable. Start @repo/web and reopen this window.</p>"
        )
    );
  }
}

export async function createDesktopWindow(
  options: CreateDesktopWindowOptions
): Promise<BrowserWindow> {
  const state = readWindowState();

  const window = new BrowserWindow({
    backgroundColor: "#0f131a",
    height: state.height,
    minHeight: 700,
    minWidth: 1100,
    show: false,
    title: "Kaine Forge Desktop",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: options.preloadPath,
      sandbox: true
    },
    width: state.width,
    x: state.x,
    y: state.y
  });

  if (state.isMaximized) {
    window.maximize();
  }

  window.on("ready-to-show", () => {
    window.show();
  });

  window.on("close", () => {
    writeWindowState(window);
  });

  await loadWindowUrl(window, options.baseRendererUrl);

  return window;
}

export async function navigateDesktopWindow(
  window: BrowserWindow,
  baseRendererUrl: string,
  route: DesktopRoute
): Promise<void> {
  await loadWindowUrl(window, resolveDesktopRouteUrl(baseRendererUrl, route));
}
