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

const modules = import.meta.glob<{ screen: LabScreen }>("./screens/*/*.screen.tsx", {
  eager: true
});

export const labScreens: readonly LabScreen[] = Object.values(modules)
  .map((module) => module.screen)
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

const registered = new Set<string>(themes.map((theme) => theme.name));

/** The registered themes, then each lab theme once. */
export const labThemes: readonly ThemeDefinition[] = [
  ...themes,
  ...labScreens
    .map((screen) => screen.theme)
    .filter(
      (theme, index, all) =>
        !registered.has(theme.name) && all.findIndex((other) => other.name === theme.name) === index
    )
];

/** Adds the CSS of every lab theme, so data-theme="<lab theme>" works like a registered one. */
export function installLabThemes(): void {
  const style = document.createElement("style");
  style.dataset["labThemes"] = "";
  style.textContent = labThemes
    .filter((theme) => !registered.has(theme.name))
    .map(emitThemeCss)
    .join("\n\n");
  document.head.append(style);
}
