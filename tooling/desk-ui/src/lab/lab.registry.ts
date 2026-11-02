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

/**
 * One `@repo/ui` component shown alone, each variant and state, under the default theme. Each
 * lives in src/specimens/<id>.specimen.tsx and registers itself by file name. A component job
 * writes one, so its gate can show the new component.
 */
export interface LabSpecimen {
  /** The component's file name, such as "rating-stars". */
  id: string;
  title: string;
  Component: ComponentType;
}

// Each screen loads on its own, so a screen another session is still writing, or one that
// fails to compile, shows as a failure in the gallery instead of blanking the whole lab.
// A screen file that is still being written can load without its `screen` export.
const loaders = import.meta.glob<{ screen?: LabScreen }>("./screens/*/*.screen.tsx");
const specimenLoaders = import.meta.glob<{ specimen?: LabSpecimen }>("./specimens/*.specimen.tsx");

/** A screen or specimen whose module failed to load, by its id. */
export interface LabScreenFailure {
  id: string;
  message: string;
}

/** Every screen and specimen that loaded, the themes to offer, and the modules that failed. */
export interface LabCatalog {
  screens: readonly LabScreen[];
  specimens: readonly LabSpecimen[];
  /** The registered themes, then each lab theme once. */
  themes: readonly ThemeDefinition[];
  /** The screens that failed to load. */
  failures: readonly LabScreenFailure[];
  /** The specimens that failed to load, apart from the screens: each index shows its own. */
  specimenFailures: readonly LabScreenFailure[];
}

const registered = new Set<string>(themes.map((theme) => theme.name));
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id.localeCompare(b.id, undefined, { numeric: true });

/**
 * Load each module on its own: the ones that export `key`, and the ones that failed. `named`
 * gives a loaded value the id of its file, when the file name is the id.
 */
async function loadEach<T, K extends string>(
  modules: Record<string, () => Promise<Partial<Record<K, T>>>>,
  key: K,
  idOf: (path: string) => string,
  named: (value: T, id: string) => T = (value) => value
): Promise<{ loaded: T[]; failures: LabScreenFailure[] }> {
  const entries = Object.entries(modules);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const loaded: T[] = [];
  const failures: LabScreenFailure[] = [];
  results.forEach((result, index) => {
    const value = result.status === "fulfilled" ? result.value[key] : undefined;
    const path = entries[index]?.[0] ?? "";
    if (value !== undefined) {
      loaded.push(named(value, idOf(path)));
      return;
    }
    failures.push({
      id: idOf(path),
      message:
        result.status === "fulfilled"
          ? `The file exports no \`${key}\`.`
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
    });
  });
  return { loaded, failures };
}

export async function loadLabCatalog(): Promise<LabCatalog> {
  const [screenModules, specimenModules] = await Promise.all([
    loadEach(loaders, "screen", (path) => /screens\/([^/]+)\//.exec(path)?.[1] ?? path),
    // A specimen's id is its file name, the name the component job's gate links to.
    loadEach(
      specimenLoaders,
      "specimen",
      (path) => /specimens\/([^/]+)\.specimen\.tsx$/.exec(path)?.[1] ?? path,
      (specimen, id) => ({ ...specimen, id })
    )
  ]);
  const screens = screenModules.loaded.sort(byId);
  const specimens = specimenModules.loaded.sort(byId);
  const failures = screenModules.failures.sort(byId);
  const specimenFailures = specimenModules.failures.sort(byId);

  const labThemes = screens
    .map((screen) => screen.theme)
    .filter(
      (theme, index, all) =>
        !registered.has(theme.name) && all.findIndex((other) => other.name === theme.name) === index
    );
  return { screens, specimens, themes: [...themes, ...labThemes], failures, specimenFailures };
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
