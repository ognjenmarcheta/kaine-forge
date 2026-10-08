import {
  Button,
  Clock,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  ProgressBar,
  RotateCcw
} from "@repo/ui";
import { toast } from "sonner";

import { useT } from "../i18n/i18n.t";
import { safeHttpUrl } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { RouteLink } from "../shell/shell.router";
import { TimeInStage } from "../shell/shell.time";
import { IssueStatusChip } from "../status/status.chip";
import type { ReadableSummary } from "../status/status.model";

function BranchFact({ branch }: { readonly branch: string }) {
  const t = useT();
  return (
    <li className="desk-meta__item desk-meta__branch">
      <GitBranch aria-hidden="true" className="desk-icon" />
      <span className="desk-sr-only">{t("desk.issue.branch")} </span>
      <code title={branch}>{branch}</code>
      <Button
        appearance="ghost"
        spacing="compact"
        className="desk-meta__copy"
        aria-label={t("desk.issue.copyBranch")}
        onClick={() => {
          navigator.clipboard
            .writeText(branch)
            .then(() => toast.success(t("desk.issue.branchCopied")))
            .catch(() => toast.error(t("desk.issue.copyFailed")));
        }}
      >
        <Copy aria-hidden="true" className="desk-icon" />
      </Button>
    </li>
  );
}

/** Back link, number, title, the one status chip, and the facts the engineer scans first. */
export function IssueHeader({ summary }: { readonly summary: ReadableSummary }) {
  const t = useT();
  const now = useNow();
  const issueUrl = safeHttpUrl(summary.url);
  const prUrl = safeHttpUrl(summary.prUrl);
  const { contract, loops } = summary;
  return (
    <header className="desk-issue-head">
      <RouteLink to={{ view: "board" }} className="desk-back">
        {t("desk.issue.back")}
      </RouteLink>
      <div className="desk-issue-head__title">
        <h1>
          <span className="desk-issue-number">
            {t("desk.issue.number", { number: summary.issueNumber })}
          </span>{" "}
          {summary.title ?? t("desk.issue.untitled")}
        </h1>
        <IssueStatusChip summary={summary} />
      </div>
      <ul className="desk-meta" aria-label={t("desk.issue.facts")}>
        {summary.branch !== null && <BranchFact branch={summary.branch} />}
        {contract !== null && (
          <li className="desk-meta__item desk-meta__contract">
            <span>{t("desk.issue.contract")}</span>
            <ProgressBar
              value={contract.found}
              max={contract.total}
              appearance={contract.found === contract.total ? "success" : "warning"}
              className="desk-meta__bar"
              aria-label={t("desk.ticket.contractProgress", {
                found: contract.found,
                total: contract.total
              })}
            />
            <span aria-hidden="true">
              {t("desk.inspector.kpi.ratio", { value: contract.found, total: contract.total })}
            </span>
          </li>
        )}
        {loops.check + loops.review > 0 && (
          <li className="desk-meta__item">
            <RotateCcw aria-hidden="true" className="desk-icon" />
            <span>{t("desk.issue.loopsValue", { check: loops.check, review: loops.review })}</span>
          </li>
        )}
        <li className="desk-meta__item">
          <Clock aria-hidden="true" className="desk-icon" />
          <TimeInStage summary={summary} now={now} />
        </li>
        {issueUrl !== null && (
          <li className="desk-meta__item">
            <a href={issueUrl} target="_blank" rel="noreferrer noopener">
              {t("desk.issue.openOnGithub")}
              <ExternalLink aria-hidden="true" className="desk-icon" />
            </a>
          </li>
        )}
        {prUrl !== null && (
          <li className="desk-meta__item">
            <a href={prUrl} target="_blank" rel="noreferrer noopener">
              <GitPullRequest aria-hidden="true" className="desk-icon" />
              {t("desk.issue.openPr")}
            </a>
          </li>
        )}
      </ul>
    </header>
  );
}
