import { Input, Label } from "@repo/ui";
import { ImageOff } from "lucide-react";
import { useId, useState } from "react";

import { LabNav } from "./lab.nav";
import type { LabCatalog, LabScreen } from "./lab.registry";

function Thumbnail({ screen }: { screen: LabScreen }) {
  const [missing, setMissing] = useState(false);

  return (
    <div className="relative aspect-video overflow-hidden bg-ds-surface-sunken">
      {missing ? (
        <div className="flex size-full flex-col items-center justify-center gap-ds-050 text-body-xs text-ds-text-subtle">
          <ImageOff aria-hidden className="size-ds-300 text-ds-icon-subtle" />
          {`No ${screen.reference} in public/references`}
        </div>
      ) : (
        <img
          alt=""
          className="size-full object-cover object-top"
          loading="lazy"
          src={`/references/${screen.reference}`}
          onError={() => setMissing(true)}
        />
      )}
    </div>
  );
}

function ScreenCard({ screen }: { screen: LabScreen }) {
  const titleId = useId();

  return (
    <li className="list-none">
      <article
        aria-labelledby={titleId}
        className="relative grid h-full overflow-hidden rounded-card border border-ds-border bg-ds-surface-raised transition-shadow duration-control ease-standard focus-within:shadow-overlay hover:shadow-overlay"
      >
        <Thumbnail screen={screen} />
        <div className="grid gap-ds-100 p-ds-200">
          <div className="flex items-start gap-ds-100">
            {/* The swatch reads the screen's own theme, so it shows that theme's brand fill. */}
            <span
              aria-hidden="true"
              className="mt-ds-050 size-ds-200 shrink-0 rounded-full border border-ds-border bg-ds-bg-brand-bold"
              data-color-mode="light"
              data-theme={screen.theme.name}
            />
            <h2 className="m-0 min-w-0 flex-1 text-heading-xs" id={titleId}>
              {/* The title link covers the card, so the whole card opens the comparison. */}
              <a
                className="text-ds-text after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-card focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ds-border-focused"
                href={`#/compare/${screen.id}`}
              >
                {screen.title}
              </a>
            </h2>
          </div>
          <p className="m-0 text-body-xs text-ds-text-subtle">
            {`${screen.id} · ${screen.width} × ${screen.height} · ${screen.mode}`}
          </p>
          <div className="relative z-10 flex flex-wrap gap-ds-150 text-body-sm">
            <a className="text-ds-link" href={`#/screens/${screen.id}`}>
              Open
            </a>
            <a className="text-ds-link" href={`#/screens/${screen.id}/dark`}>
              Open dark
            </a>
          </div>
        </div>
      </article>
    </li>
  );
}

/** Every recreated screen as a searchable card grid, with the screens that did not load. */
export function ScreensIndex({ catalog }: { catalog: LabCatalog }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = catalog.screens.filter((screen) => {
    const text = `${screen.id} ${screen.title} ${screen.theme.label}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <div className="min-h-screen bg-ds-surface-sunken text-ds-text">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-ds-150 border-b border-ds-border bg-ds-surface px-ds-300 py-ds-150">
        <p className="m-0 mr-auto text-heading-sm">Kaine UI Lab</p>
        <LabNav current="screens" />
      </header>
      <main className="grid gap-ds-300 p-ds-300">
        <div className="flex flex-wrap items-end justify-between gap-ds-200">
          <div className="grid gap-ds-050">
            <h1 className="m-0 text-heading-lg">Recreated screens</h1>
            <p className="m-0 text-body-sm text-ds-text-subtle">
              {`${catalog.screens.length} screens. Open one to compare it with its reference.`}
            </p>
          </div>
          <div className="grid w-full gap-ds-050 sm:w-72">
            <Label htmlFor={searchId}>Find a screen</Label>
            <Input
              id={searchId}
              placeholder="Number, name, or theme"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {catalog.failures.length > 0 ? (
          <section
            aria-label="Screens that did not load"
            className="grid gap-ds-100 rounded-md border border-ds-border-danger bg-ds-bg-danger px-ds-200 py-ds-150"
          >
            <p className="m-0 text-body-sm font-medium text-ds-text-danger">
              {`${catalog.failures.length} screen(s) did not load`}
            </p>
            <ul className="m-0 flex flex-wrap gap-ds-150 p-0">
              {catalog.failures.map((failure) => (
                <li key={failure.id} className="list-none">
                  <a
                    className="text-body-sm text-ds-text-danger underline"
                    href={`#/screens/${failure.id}`}
                  >
                    {failure.id}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {shown.length > 0 ? (
          <ul className="m-0 grid grid-cols-1 gap-ds-200 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((screen) => (
              <ScreenCard key={screen.id} screen={screen} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-body text-ds-text-subtle" role="status">
            No screen matches that search.
          </p>
        )}
      </main>
    </div>
  );
}
