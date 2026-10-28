import { useEffect, useState } from "react";

import { LabGallery } from "./lab.gallery";
import { labScreens, type LabScreen } from "./lab.registry";

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");

  useEffect(() => {
    const update = (): void => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}

/** One recreated screen under its own theme, in its reference mode or the one the route names. */
function ScreenView({ screen, mode }: { screen: LabScreen; mode: string }) {
  const { Component } = screen;

  return (
    <div
      className="min-h-screen bg-ds-bg text-ds-text"
      data-color-mode={mode === "light" || mode === "dark" ? mode : screen.mode}
      data-theme={screen.theme.name}
    >
      <Component />
    </div>
  );
}

/** The reference and the recreation side by side, at the reference's frame size. */
function CompareView({ screen }: { screen: LabScreen }) {
  const frame = { width: screen.width, height: screen.height };

  return (
    <main className="flex gap-ds-200 bg-ds-surface-sunken p-ds-200 text-ds-text">
      <figure className="m-0 grid gap-ds-100">
        <figcaption className="text-heading-xs">Reference</figcaption>
        <img
          alt={`Reference for ${screen.title}`}
          className="block border border-ds-border object-contain object-top"
          src={`/references/${screen.reference}`}
          style={frame}
        />
      </figure>
      <figure className="m-0 grid gap-ds-100">
        <figcaption className="text-heading-xs">Recreation</figcaption>
        <iframe
          className="block border border-ds-border bg-ds-bg"
          src={`#/screens/${screen.id}`}
          style={frame}
          title={`Recreation of ${screen.title}`}
        />
      </figure>
    </main>
  );
}

export function LabApp() {
  const route = useHashRoute();
  const [, view = "", id = "", mode = ""] = route.split("/");
  const screen = labScreens.find((entry) => entry.id === id);

  if (screen && view === "screens") return <ScreenView mode={mode} screen={screen} />;
  if (screen && view === "compare") return <CompareView screen={screen} />;

  return <LabGallery />;
}
