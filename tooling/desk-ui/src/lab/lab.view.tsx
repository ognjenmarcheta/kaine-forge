import { Button } from "@repo/ui";
import { useEffect, useState } from "react";

import { LabApp } from "./lab.app";
import { installLabThemes, loadLabCatalog, type LabCatalog } from "./lab.registry";
import { useT } from "../i18n/i18n.t";
import { openJobOf } from "../jobs/job.model";
import { JobStartDialog } from "../jobs/job.start-dialog";
import { RouteLink } from "../shell/shell.router";
import { Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

let catalogLoad: Promise<LabCatalog> | null = null;

/** The screens and themes load once a page: the lab themes' CSS is added once. */
const loadCatalogOnce = (): Promise<LabCatalog> =>
  (catalogLoad ??= loadLabCatalog().then((catalog) => {
    installLabThemes(catalog);
    return catalog;
  }));

/** Start a screen job from the lab, or follow the one that runs. Only with the desk server. */
function ScreenJobBar() {
  const t = useT();
  const { state } = useDesk();
  const [starting, setStarting] = useState(false);
  if (state.session !== "ready") return null;
  const open = openJobOf(state.jobs, "screen");
  return (
    <div className="desk-job-actions desk-lab-jobs">
      {open === null ? (
        <Button onClick={() => setStarting(true)}>{t("desk.job.start.screen")}</Button>
      ) : (
        <RouteLink to={{ view: "job", jobId: open.id }}>
          {t("desk.job.openScreenJob", {
            id: open.id,
            status: t(`desk.job.status.${open.status}`)
          })}
        </RouteLink>
      )}
      <JobStartDialog kind="screen" open={starting} onOpenChange={setStarting} />
    </div>
  );
}

/**
 * The UI lab inside the desk: the component gallery, the options, the recreated screens and their
 * compare view, and the chart primitives. The lab keeps its own `#/…` routes under `?view=lab`.
 * The lab calls no desk API, so it works on `pnpm lab` without a desk server; the screen job bar
 * shows only with one.
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

  return (
    <>
      <ScreenJobBar />
      {catalog === null ? <Loading /> : <LabApp catalog={catalog} />}
    </>
  );
}
