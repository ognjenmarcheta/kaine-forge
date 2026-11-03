import type { ScorecardRun, ScorecardTracking, TrackedIssue } from "@repo/desk/contracts";
import { Button, Card, Modal } from "@repo/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { recentlySolved, solvedAt, type Tracking } from "./scorecard.model";
import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useIssueActions } from "../gates/gate.actions";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatDate, safeHttpUrl } from "../shell/shell.format";
import { RouteLink } from "../shell/shell.router";
import { Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";

/** The scorecard's issues from GitHub: loaded once, again on `reload(true)`. */
export function useScorecardTracking(): {
  readonly tracking: ScorecardTracking | null;
  readonly issues: Tracking;
  readonly reload: (refresh: boolean) => void;
} {
  const { api } = useDesk();
  const [tracking, setTracking] = useState<ScorecardTracking | null>(null);
  const reload = useCallback(
    (refresh: boolean): void => {
      api.scorecardTracking(refresh).then(setTracking, (failure: unknown) =>
        setTracking({
          ok: false,
          reason: toApiError(failure).detail ?? "",
          fetchedAt: new Date().toISOString()
        })
      );
    },
    [api]
  );
  useEffect(() => reload(false), [reload]);
  const issues = useMemo(
    () =>
      new Map((tracking?.ok === true ? tracking.issues : []).map((issue) => [issue.number, issue])),
    [tracking]
  );
  return { tracking, issues, reload };
}

function Link({ href, children }: { readonly href: string; readonly children: string }) {
  const safe = safeHttpUrl(href);
  return safe === null ? (
    <>{children}</>
  ) : (
    <a href={safe} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

/**
 * A finding's issue, its fix, and its desk run. An open issue without a run offers **Fix with
 * desk**, which starts an issue run like the Board's Start.
 */
export function IssueCell({ issue }: { readonly issue: TrackedIssue }) {
  const t = useT();
  const { language } = useLanguage();
  const { state } = useDesk();
  const actions = useIssueActions(issue.number, false);
  const solved = solvedAt(issue);
  const onBoard = state.issues[issue.number] !== undefined;
  return (
    <span className="desk-score-issue">
      <Link href={issue.url}>{t("desk.issue.number", { number: issue.number })}</Link>
      <StatusChip
        tone={solved !== null ? "success" : issue.state === "open" ? "information" : "neutral"}
      >
        {solved !== null
          ? t("desk.scorecard.tracking.solved", { date: formatDate(solved, language) })
          : t(`desk.scorecard.tracking.issue.${issue.state}`)}
      </StatusChip>
      {issue.fix !== null && solved === null && (
        <Link href={issue.fix.url}>
          {t(`desk.scorecard.tracking.fix.${issue.fix.state}`, { number: issue.fix.number })}
        </Link>
      )}
      {issue.run !== null || onBoard ? (
        <RouteLink to={{ view: "issue", issueNumber: issue.number }}>
          {t("desk.scorecard.tracking.run")}
        </RouteLink>
      ) : (
        issue.state === "open" && (
          <Button
            appearance="subtle"
            spacing="compact"
            disabled={actions.busy}
            onClick={() => void actions.run({ action: "start" })}
          >
            {t("desk.scorecard.tracking.fixWithDesk")}
          </Button>
        )
      )}
    </span>
  );
}

/** The newest fixes: the finding, its issue and PR, the merge date, and the score change. */
export function RecentlySolved({
  runs,
  issues
}: {
  readonly runs: readonly ScorecardRun[];
  readonly issues: Tracking;
}) {
  const t = useT();
  const { language } = useLanguage();
  const solved = recentlySolved(runs, issues);
  return (
    <Card className="dk-card">
      <h2>{t("desk.scorecard.tracking.recent")}</h2>
      {solved.length === 0 ? (
        <Muted>{t("desk.scorecard.tracking.noneSolved")}</Muted>
      ) : (
        <ul className="desk-score-solved">
          {solved.map(({ finding, issue, solvedAt: when, delta }) => (
            <li key={finding.slug}>
              <span>{finding.title}</span>
              <span className="dk-t-sub">
                <Link href={issue.url}>{t("desk.issue.number", { number: issue.number })}</Link>{" "}
                {issue.fix !== null && (
                  <Link href={issue.fix.url}>
                    {t("desk.issue.number", { number: issue.fix.number })}
                  </Link>
                )}{" "}
                {t("desk.scorecard.tracking.mergedOn", { date: formatDate(when, language) })}
                {delta !== null &&
                  ` ${t("desk.scorecard.tracking.delta", {
                    dimension: delta.dimension,
                    before: delta.before ?? "–",
                    after: delta.after ?? "–",
                    date: delta.afterDate
                  })}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * When GitHub was read, a Refresh, and the one-time label for older scorecard issues: a preview,
 * then the owner's confirmation.
 */
export function TrackingBar({
  tracking,
  reload
}: {
  readonly tracking: ScorecardTracking | null;
  readonly reload: (refresh: boolean) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const { api } = useDesk();
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const unlabeled = tracking?.ok === true ? tracking.issues.filter((issue) => !issue.labeled) : [];
  const label = async (): Promise<void> => {
    setPending(true);
    try {
      const result = await api.scorecardBackfill(unlabeled.map((issue) => issue.number));
      const failed = result.results.filter((entry) => !entry.ok).length;
      setNote(
        t("desk.scorecard.tracking.labelled", {
          done: result.results.length - failed,
          failed
        })
      );
      reload(true);
    } catch (failure) {
      const converted = toApiError(failure);
      setNote(converted.detail ?? t(failureMessageKey(converted.code)));
    } finally {
      setPending(false);
      setPreview(false);
    }
  };
  return (
    <div className="desk-score-trackbar">
      <span className="dk-t-sub" role="status">
        {tracking === null
          ? t("desk.scorecard.tracking.loading")
          : tracking.ok
            ? t("desk.scorecard.tracking.read", {
                count: tracking.issues.length,
                date: formatDate(tracking.fetchedAt, language)
              })
            : t("desk.scorecard.tracking.failed", { reason: tracking.reason })}
      </span>
      <Button appearance="subtle" spacing="compact" onClick={() => reload(true)}>
        {t("desk.github.refresh")}
      </Button>
      {unlabeled.length > 0 && (
        <Button appearance="subtle" spacing="compact" onClick={() => setPreview(true)}>
          {t("desk.scorecard.tracking.backfill", { count: unlabeled.length })}
        </Button>
      )}
      {note !== null && <span className="dk-t-sub">{note}</span>}
      <Modal
        open={preview}
        onOpenChange={setPreview}
        title={t("desk.scorecard.tracking.backfillTitle")}
        description={t("desk.scorecard.tracking.backfillText", { count: unlabeled.length })}
        closeButtonLabel={t("desk.common.close")}
        size="md"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setPreview(false) },
          {
            appearance: "default",
            label: t("desk.scorecard.tracking.backfillConfirm"),
            loading: pending,
            loadingLabel: t("desk.scorecard.tracking.backfillConfirm"),
            onClick: () => void label()
          }
        ]}
      >
        <ul className="desk-score-solved">
          {unlabeled.map((issue) => (
            <li key={issue.number}>
              {t("desk.issue.number", { number: issue.number })} {issue.title}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
