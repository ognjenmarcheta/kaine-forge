import { emitThemeCss, themes, type ThemeDefinition } from "@repo/theme";
import type { ComponentType } from "react";

/** One recreated screen. Each lives in src/screens/<id>/ and registers itself by file name. */
export interface LabScreen {
  /** Folder name, such as "10-medspa". */
  id: string;
  title: string;
  /** The look of the reference, as a theme. Lab themes never ship. */
  theme: ThemeDefinition;
  mode: "light" | "dark";
  /** The reference's frame, used for the screenshot and the side-by-side view. */
  width: number;
  height: number;
  /** File name in public/references/, which is gitignored. */
  reference: string;
  /**
   * The part of the reference that shows the app, in the image's own pixels, when the image
   * has a backdrop or a device frame around it. The compare view scales it to the frame.
   */
  referenceCrop?: LabCrop;
  Component: ComponentType;
}

/** A rectangle in the reference image's own pixels. */
export interface LabCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Each screen loads on its own, so a screen another session is still writing, or one that
// fails to compile, shows as a failure in the gallery instead of blanking the whole lab.
// A screen file that is still being written can load without its `screen` export.
const loaders = import.meta.glob<{ screen?: LabScreen }>("./screens/*/*.screen.tsx");

/** A screen whose module failed to load, by folder name. */
export interface LabScreenFailure {
  id: string;
  message: string;
}

/** Every screen that loaded, the themes to offer, and the screens that failed. */
export interface LabCatalog {
  screens: readonly LabScreen[];
  /** The registered themes, then each lab theme once. */
  themes: readonly ThemeDefinition[];
  failures: readonly LabScreenFailure[];
}

const registered = new Set<string>(themes.map((theme) => theme.name));
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id.localeCompare(b.id, undefined, { numeric: true });

export async function loadLabCatalog(): Promise<LabCatalog> {
  const entries = Object.entries(loaders);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const screens: LabScreen[] = [];
  const failures: LabScreenFailure[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.screen) {
      screens.push(result.value.screen);
      return;
    }
    const path = entries[index]?.[0] ?? "";
    failures.push({
      id: /screens\/([^/]+)\//.exec(path)?.[1] ?? path,
      message:
        result.status === "fulfilled"
          ? "The file exports no `screen`."
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
    });
  });
  screens.sort(byId);
  failures.sort(byId);

  const labThemes = screens
    .map((screen) => screen.theme)
    .filter(
      (theme, index, all) =>
        !registered.has(theme.name) && all.findIndex((other) => other.name === theme.name) === index
    );
  return { screens, themes: [...themes, ...labThemes], failures };
}

let installed: CSSStyleSheet | null = null;

/**
 * Adds the CSS of every lab theme, so data-theme="<lab theme>" works like a registered one. A
 * constructed stylesheet, not a <style> element: the desk server's CSP (`style-src 'self'`)
 * blocks inline style elements. A second call replaces the sheet.
 */
export function installLabThemes(catalog: LabCatalog): void {
  // jsdom has no constructed stylesheets; a test needs no theme CSS.
  if (!("adoptedStyleSheets" in document)) return;
  const css = catalog.themes
    .filter((theme) => !registered.has(theme.name))
    .map(emitThemeCss)
    .join("\n\n");
  const sheet = installed ?? new CSSStyleSheet();
  sheet.replaceSync(css);
  if (installed === null) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    installed = sheet;
  }
}
