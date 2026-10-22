import type { ShipReadiness } from "@repo/desk/contracts";
import { Button, Check, ProgressBar } from "@repo/ui";
import { useMemo, useState } from "react";

import { FeedbackForm } from "./gate.feedback";
import { DecideBar, Kbd, RevisionNote, type GateBodyProps } from "./gate.frame";
import { orderReviewFiles, sendBackTargets } from "./gate.model";
import { RiskRecord } from "./gate.record";
import { useViewedFiles } from "./gate.viewed";
import { DiffReview } from "../artifacts/artifact.diff";
import { parseDiffFiles } from "../artifacts/artifact.diffstat";
import { FindingLinks, ReviewVerdictLine } from "../artifacts/artifact.review";
import { useTextArtifact } from "../artifacts/artifact.use";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { useShortcuts } from "../shell/shell.keys";
import { usePaletteActions } from "../shell/shell.palette";
import { FailureText, Loading, Muted } from "../shell/shell.ui";

const NO_FINDINGS: never[] = [];

const READINESS = [
  ["checkPassed", "desk.gate.ready.check"],
  ["reviewApproved", "desk.gate.ready.review"],
  ["reviewedDiffMatches", "desk.gate.ready.sameDiff"],
  ["currentDiffMatches", "desk.gate.ready.worktree"]
] as const satisfies readonly (readonly [keyof ShipReadiness, string])[];

/** One line when every ship condition holds; otherwise the ones that do not, by name. */
function Readiness({ ship }: { readonly ship: ShipReadiness }) {
  const t = useT();
  if (ship.ready) {
    return (
      <p className="desk-ready">
        <Check aria-hidden="true" className="desk-icon" /> {t("desk.gate.ready.yes")}{" "}
        <span className="desk-muted">{t("desk.gate.ready.why")}</span>
      </p>
    );
  }
  const open = READINESS.filter(([field]) => ship[field] !== true);
  return (
    <div className="desk-warning">
      <strong>{t("desk.gate.ready.no")}</strong>
      <ul className="desk-ready__open">
        {open.map(([field, key]) => (
          <li key={field}>{t(key)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The review gate: the verdict, whether the work is ready to ship, what changed since the first
 * build, and the diff in risk order with Viewed boxes. Ship stays secondary until every file is
 * viewed; until then Next unviewed file (N) leads. S opens the ship dialog at any time.
 */
export function ReviewGate({
  detail,
  summary,
  revision,
  actions,
  send,
  titleId,
  onShip
}: GateBodyProps) {
  const t = useT();
  const review = detail.review;
  const findings = review?.findings ?? NO_FINDINGS;
  const diff = useTextArtifact(summary.issueNumber, "diff", revision);
  const files = useMemo(
    () => (diff.status === "ok" ? orderReviewFiles(parseDiffFiles(diff.value), findings) : []),
    [diff, findings]
  );
  const { viewed, setViewed } = useViewedFiles(summary.issueNumber, review?.diffHash ?? "none");
  const [current, setCurrent] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const unviewed = files.filter((entry) => !viewed.has(entry.file.path));
  const seen = files.length - unviewed.length;
  const allViewed = unviewed.length === 0;

  const select = (path: string, line: number | null = null): void => {
    setCurrent(path);
    setHighlight(line);
  };
  /** The first file after the open one that is not marked viewed, wrapping around. */
  const nextUnviewed = (): void => {
    const at = files.findIndex((entry) => entry.file.path === (current ?? files[0]?.file.path));
    const after = [...files.slice(at + 1), ...files.slice(0, at + 1)];
    const next = after.find((entry) => !viewed.has(entry.file.path));
    if (next !== undefined) select(next.file.path);
  };
  const openShip = (): void => {
    if (!actions.busy) onShip(unviewed.map((entry) => entry.file.path));
  };
  const markViewed = (path: string, on: boolean): void => {
    setViewed(path, on);
    // The next file to read opens by itself once this one is done.
    if (on && path === (current ?? files[0]?.file.path)) {
      const next = unviewed.find((entry) => entry.file.path !== path);
      if (next !== undefined) select(next.file.path);
    }
  };

  useShortcuts([
    { key: "s", run: openShip, labelKey: "desk.gate.keys.ship" },
    { key: "n", run: nextUnviewed, labelKey: "desk.gate.keys.nextFile" }
  ]);
  usePaletteActions([
    { id: "gate-ship", label: t("desk.gate.pr.ship"), hint: "S", run: openShip },
    ...(allViewed
      ? []
      : [
          { id: "gate-next-file", label: t("desk.diff.nextUnviewed"), hint: "N", run: nextUnviewed }
        ]),
    { id: "gate-changes", label: t("desk.gate.requestChanges"), run: () => setFeedbackOpen(true) }
  ]);

  return (
    <>
      {review !== null && <ReviewVerdictLine review={review} />}
      <Readiness ship={detail.ship} />
      {detail.buildRevision !== null && (
        <RevisionNote title={t("desk.gate.pr.changed")} text={detail.buildRevision} />
      )}
      <RiskRecord risk={summary.planRisk} />
      <section className="desk-sec">
        <h3>{t("desk.review.findings")}</h3>
        <FindingLinks findings={findings} onGo={(finding) => select(finding.file, finding.line)} />
      </section>
      <section className="desk-sec">
        <h3>{t("desk.diff.title")}</h3>
        {diff.status === "loading" && <Loading />}
        {diff.status === "missing" && <Muted>{t("desk.artifact.missing")}</Muted>}
        {diff.status === "error" && <FailureText code={diff.code} detail={diff.detail} />}
        {diff.status === "ok" && (
          <>
            <p className="desk-muted">{t("desk.diff.order")}</p>
            <DiffReview
              files={files}
              viewed={viewed}
              onViewed={markViewed}
              current={current}
              onSelect={select}
              highlight={highlight}
            />
          </>
        )}
      </section>
      {feedbackOpen && (
        <FeedbackForm
          targets={sendBackTargets(issueFlowOf(summary), summary.stage)}
          busy={actions.busy}
          onCancel={() => setFeedbackOpen(false)}
          onSend={async (to, text) => {
            const sent = await send({ action: "feedback", to, text });
            if (sent) setFeedbackOpen(false);
            return sent;
          }}
        />
      )}
      <DecideBar
        labelledBy={titleId}
        hint={
          files.length === 0 ? undefined : (
            <>
              <span className="desk-vprog">
                <ProgressBar
                  value={seen}
                  max={files.length}
                  appearance="success"
                  className="desk-vprog__bar"
                  aria-hidden="true"
                />
                <strong>{t("desk.diff.viewedCount", { viewed: seen, total: files.length })}</strong>
              </span>
              {t(allViewed ? "desk.gate.pr.hintViewed" : "desk.gate.pr.hint")}
            </>
          )
        }
      >
        <Button
          appearance={allViewed ? "default" : "secondary"}
          disabled={actions.busy}
          aria-keyshortcuts="S"
          onClick={openShip}
        >
          {t("desk.gate.pr.ship")}
          <Kbd shortcut="s" />
        </Button>
        {!allViewed && (
          <Button aria-keyshortcuts="N" onClick={nextUnviewed}>
            {t("desk.diff.nextUnviewed")}
            <Kbd shortcut="n" />
          </Button>
        )}
        <Button
          appearance="secondary"
          disabled={actions.busy}
          aria-expanded={feedbackOpen}
          onClick={() => setFeedbackOpen((open) => !open)}
        >
          {t("desk.gate.requestChanges")}
        </Button>
      </DecideBar>
    </>
  );
}
