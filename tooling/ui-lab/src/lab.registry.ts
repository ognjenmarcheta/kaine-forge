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
  Component: ComponentType;
}

// Each screen loads on its own, so a screen another session is still writing, or one that
// fails to compile, shows as a failure in the gallery instead of blanking the whole lab.
const loaders = import.meta.glob<{ screen: LabScreen }>("./screens/*/*.screen.tsx");

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
    if (result.status === "fulfilled") {
      screens.push(result.value.screen);
      return;
    }
    const path = entries[index]?.[0] ?? "";
    failures.push({
      id: /screens\/([^/]+)\//.exec(path)?.[1] ?? path,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason)
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

/** Adds the CSS of every lab theme, so data-theme="<lab theme>" works like a registered one. */
export function installLabThemes(catalog: LabCatalog): void {
  const style = document.createElement("style");
  style.dataset["labThemes"] = "";
  style.textContent = catalog.themes
    .filter((theme) => !registered.has(theme.name))
    .map(emitThemeCss)
    .join("\n\n");
  document.head.append(style);
}
