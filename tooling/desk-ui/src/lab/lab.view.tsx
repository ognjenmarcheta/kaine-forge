import { Button } from "@repo/ui";
import { useEffect, useState } from "react";

import { LabApp } from "./lab.app";
import { installLabThemes, loadLabCatalog, type LabCatalog } from "./lab.registry";
import { useT } from "../i18n/i18n.t";
import { openJobOf } from "../jobs/job.model";
import { useNewWork } from "../shell/shell.newwork";
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

/** The lab's job kinds and their start buttons. */
const LAB_JOBS = [
  { kind: "screen", start: "desk.job.start.screen" },
  { kind: "component", start: "desk.job.start.component" },
  { kind: "audit", start: "desk.job.start.audit" }
] as const;

/** Start a lab job, or follow the one of its kind that runs. One at a time of each kind. */
function LabJob({ kind, start }: (typeof LAB_JOBS)[number]) {
  const t = useT();
  const { state } = useDesk();
  const newWork = useNewWork();
  const open = openJobOf(state.jobs, kind);
  return (
    <>
      {open === null ? (
        <Button appearance="subtle" onClick={() => newWork.open({ tab: "job", kind })}>
          {t(start)}
        </Button>
      ) : (
        <RouteLink to={{ view: "job", jobId: open.id }}>
          {t("desk.job.openLabJob", {
            job: t(`desk.job.title.${kind}`, { id: open.id }),
            status: t(`desk.job.status.${open.status}`)
          })}
        </RouteLink>
      )}
    </>
  );
}

/** The lab's jobs: recreate a screen, build a component, audit a screen. Only with the desk server. */
function LabJobBar() {
  const { state } = useDesk();
  if (state.session !== "ready") return null;
  return (
    <div className="dk-row">
      {LAB_JOBS.map((job) => (
        <LabJob key={job.kind} {...job} />
      ))}
    </div>
  );
}

/**
 * The UI lab inside the desk: the component gallery, the options, the recreated screens and their
 * compare view, and the chart primitives. The lab keeps its own `#/…` routes under `?view=lab`.
 * The lab calls no desk API, so it works on `pnpm lab` without a desk server; the job bar shows
 * only with one.
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

  const t = useT();
  return (
    <>
      <header className="dk-ph">
        <div className="dk-grow">
          <h1 className="dk-h-page">{t("desk.nav.lab")}</h1>
          <p className="dk-lead">{t("desk.lab.intro")}</p>
        </div>
        <LabJobBar />
      </header>
      {catalog === null ? <Loading /> : <LabApp catalog={catalog} />}
    </>
  );
}
