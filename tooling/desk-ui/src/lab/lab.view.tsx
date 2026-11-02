import { useEffect, useState } from "react";

import { LabApp } from "./lab.app";
import { installLabThemes, loadLabCatalog, type LabCatalog } from "./lab.registry";
import { Loading } from "../shell/shell.ui";

let catalogLoad: Promise<LabCatalog> | null = null;

/** The screens and themes load once a page: the lab themes' CSS is added once. */
const loadCatalogOnce = (): Promise<LabCatalog> =>
  (catalogLoad ??= loadLabCatalog().then((catalog) => {
    installLabThemes(catalog);
    return catalog;
  }));

/**
 * The UI lab inside the desk: the component gallery, the options, the recreated screens and their
 * compare view, and the chart primitives. The lab keeps its own `#/…` routes under `?view=lab`.
 * It calls no desk API, so it works on `pnpm lab` without a desk server.
 */
export function LabView() {
  const [catalog, setCatalog] = useState<LabCatalog | null>(null);

  useEffect(() => {
    let live = true;
    void loadCatalogOnce().then((loaded) => {
      if (live) setCatalog(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  return catalog === null ? <Loading /> : <LabApp catalog={catalog} />;
}
