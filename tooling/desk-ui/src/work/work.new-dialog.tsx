import { JOB_KINDS, type JobKind } from "@repo/desk/contracts";
import { Button, Modal } from "@repo/ui";
import { useState } from "react";

import { IssueStartForm } from "./work.start-issue";
import { JobStartForm } from "./work.start-job";
import { useT } from "../i18n/i18n.t";
import { Segmented } from "../shell/shell.ui";

/** What New work opens on: a GitHub issue, optionally on a flow, or a desk job of a kind. */
export type NewWorkRequest =
  | { readonly tab: "issue"; readonly flowId?: string }
  | { readonly tab: "job"; readonly kind?: JobKind; readonly screen?: string };

const TABS = ["issue", "job"] as const;

/**
 * New work: an issue from GitHub runs through a flow to a draft PR; a desk job needs no issue.
 * One dialog with both, so every "start" on the desk opens the same place.
 */
export function NewWorkDialog({
  request,
  onClose
}: {
  /** `null` while closed. */
  readonly request: NewWorkRequest | null;
  readonly onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<(typeof TABS)[number]>(request?.tab ?? "issue");
  const [kind, setKind] = useState<JobKind>(
    request?.tab === "job" ? (request.kind ?? "audit") : "audit"
  );
  const [opened, setOpened] = useState(request);
  // A new request (another button) starts on its own tab and kind.
  if (opened !== request) {
    setOpened(request);
    if (request !== null) {
      setTab(request.tab);
      if (request.tab === "job" && request.kind !== undefined) setKind(request.kind);
    }
  }

  return (
    <Modal
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("desk.newWork.open")}
      description={t("desk.newWork.intro")}
      closeButtonLabel={t("desk.common.close")}
      size="lg"
      hideFooter
    >
      <div className="dk-stack dk-gap-200">
        <Segmented
          label={t("desk.newWork.kind")}
          value={tab}
          options={TABS}
          name={(option) => t(`desk.newWork.tab.${option}`)}
          onChange={setTab}
        />
        {tab === "issue" ? (
          <IssueStartForm
            open={request !== null}
            flowId={request?.tab === "issue" ? (request.flowId ?? null) : null}
            onCancel={onClose}
            onStarted={onClose}
          />
        ) : (
          <>
            <div className="dk-jobk" role="radiogroup" aria-label={t("desk.newWork.job")}>
              {JOB_KINDS.map((option) => (
                <Button
                  key={option}
                  appearance="ghost"
                  className="dk-bare"
                  role="radio"
                  aria-checked={option === kind}
                  onClick={() => setKind(option)}
                >
                  <b>{t(`desk.job.start.title.${option}`)}</b>
                  <span className="dk-t-small dk-t-sub">{t(`desk.newWork.jobText.${option}`)}</span>
                </Button>
              ))}
            </div>
            <p className="dk-hint">{t("desk.newWork.jobRule")}</p>
            <JobStartForm
              key={kind}
              kind={kind}
              {...(request?.tab === "job" && request.screen !== undefined
                ? { screen: request.screen }
                : {})}
              onCancel={onClose}
              onStarted={onClose}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
