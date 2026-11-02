import { useEffect } from "react";

import { LabNav } from "./lab.nav";
import type { LabCatalog, LabSpecimen } from "./lab.registry";

/** Every component specimen, each a link to its own page. */
export function SpecimensIndex({ catalog }: { catalog: LabCatalog }) {
  return (
    <main className="grid content-start gap-ds-300 p-ds-300 text-ds-text">
      <header className="flex flex-wrap items-center justify-between gap-ds-200">
        <h1 className="m-0 text-heading-md">Specimens</h1>
        <LabNav current="specimens" />
      </header>
      <p className="m-0 max-w-prose text-body text-ds-text-subtle">
        One new component each, with every variant and state, under the default theme. A component
        job of the agent desk writes one in src/lab/specimens/.
      </p>
      {catalog.specimenFailures.length > 0 ? (
        <section
          aria-label="Specimens that did not load"
          className="grid gap-ds-100 rounded-md border border-ds-border-danger bg-ds-bg-danger px-ds-200 py-ds-150"
        >
          <p className="m-0 text-body-sm font-medium text-ds-text-danger">
            {`${catalog.specimenFailures.length} specimen(s) did not load`}
          </p>
          <ul className="m-0 flex flex-wrap gap-ds-150 p-0">
            {catalog.specimenFailures.map((failure) => (
              <li key={failure.id} className="list-none">
                <a
                  className="text-body-sm text-ds-text-danger underline"
                  href={`#/specimens/${failure.id}`}
                >
                  {failure.id}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {catalog.specimens.length === 0 ? (
        <p className="m-0 text-body text-ds-text-subtle">No specimens yet.</p>
      ) : (
        <ul className="m-0 grid gap-ds-100 p-0">
          {catalog.specimens.map((specimen) => (
            <li key={specimen.id} className="list-none">
              <a className="text-body text-ds-link" href={`#/specimens/${specimen.id}`}>
                {specimen.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/** One specimen alone, in the mode the route names (light by default). */
export function SpecimenView({ specimen, mode }: { specimen: LabSpecimen; mode: string }) {
  const { Component } = specimen;
  const colorMode = mode === "dark" ? "dark" : "light";

  // Portals (menus, dialogs, tooltips) render outside the page, so the mode goes on <html>.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset["colorMode"];
    root.dataset["colorMode"] = colorMode;
    return () => {
      if (before === undefined) delete root.dataset["colorMode"];
      else root.dataset["colorMode"] = before;
    };
  }, [colorMode]);

  return (
    <main className="grid min-h-screen content-start gap-ds-300 bg-ds-bg p-ds-300 text-ds-text">
      <h1 className="m-0 text-heading-md">{specimen.title}</h1>
      {/* A block, so the page's grid does not stretch the component past its own size. */}
      <div>
        <Component />
      </div>
    </main>
  );
}
