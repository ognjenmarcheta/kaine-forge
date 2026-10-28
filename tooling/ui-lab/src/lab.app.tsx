import { useEffect, useState } from "react";

import { ChartsPage } from "./lab.charts";
import { CompareView } from "./lab.compare";
import { LabGallery } from "./lab.gallery";
import type { LabCatalog, LabScreen } from "./lab.registry";
import { ScreensIndex } from "./lab.screens";

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");

  useEffect(() => {
    const update = (): void => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}

/**
 * One recreated screen under its own theme, in its reference mode or the one the route names.
 * The screen is alone on the page, so the theme goes on <html>: menus, dialogs, and tooltips
 * render in portals outside the screen and must get the same theme.
 */
function ScreenView({ screen, mode }: { screen: LabScreen; mode: string }) {
  const { Component } = screen;
  const colorMode = mode === "light" || mode === "dark" ? mode : screen.mode;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset["theme"] = screen.theme.name;
    root.dataset["colorMode"] = colorMode;
    return () => {
      delete root.dataset["theme"];
      delete root.dataset["colorMode"];
    };
  }, [colorMode, screen.theme.name]);

  return (
    <div className="min-h-screen bg-ds-bg text-ds-text">
      <Component />
    </div>
  );
}

export function LabApp({ catalog }: { catalog: LabCatalog }) {
  const route = useHashRoute();
  const [, view = "", id = "", mode = ""] = route.split("/");
  const screen = catalog.screens.find((entry) => entry.id === id);
  const failure = catalog.failures.find((entry) => entry.id === id);

  if (view === "charts") return <ChartsPage catalog={catalog} />;
  if (view === "screens" && !id) return <ScreensIndex catalog={catalog} />;
  if (screen && view === "screens") return <ScreenView mode={mode} screen={screen} />;
  if (screen && view === "compare") {
    // The route sets the starting mode, so a new route starts a new view.
    return <CompareView key={route} catalog={catalog} screen={screen} view={mode} />;
  }
  if (failure && (view === "screens" || view === "compare")) {
    return (
      <main className="grid gap-ds-100 p-ds-300 text-ds-text">
        <h1 className="m-0 text-heading-sm">{`Screen ${failure.id} did not load`}</h1>
        <pre className="m-0 whitespace-pre-wrap text-body-sm text-ds-text-danger">
          {failure.message}
        </pre>
      </main>
    );
  }

  return <LabGallery catalog={catalog} />;
}
