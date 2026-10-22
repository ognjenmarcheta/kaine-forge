import { plannerOutputSchema, type IssueDetail } from "@repo/desk/contracts";
import { Button } from "@repo/ui";
import { useState } from "react";

import { FeedbackForm } from "./gate.feedback";
import { DecideBar, Kbd, RevisionNote, type GateBodyProps } from "./gate.frame";
import { planRound, sendBackTargets, shipsWithoutReview } from "./gate.model";
import { RiskRecord } from "./gate.record";
import { PlanGateBody } from "../artifacts/artifact.plan";
import { useJsonArtifact } from "../artifacts/artifact.use";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { useShortcuts } from "../shell/shell.keys";
import { usePaletteActions } from "../shell/shell.palette";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { StatusChip } from "../status/status.chip";
import { PLAN_RISK_KEY, PLAN_RISK_TONE, type ReadableSummary } from "../status/status.model";

/** The planner's grade, why, and how earlier plans of that grade ended. Hidden for an ungraded plan. */
function RiskLine({
  detail,
  summary
}: {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
}) {
  const t = useT();
  const risk = detail.plan?.risk ?? summary.planRisk;
  if (risk === null) return null;
  const reasons = detail.plan?.riskReasons ?? [];
  return (
    <div className="desk-riskline">
      <StatusChip tone={PLAN_RISK_TONE[risk]}>{t(PLAN_RISK_KEY[risk])}</StatusChip>
      {reasons.length > 0 && <span>{reasons.join(" · ")}</span>}
      <RiskRecord risk={risk} />
    </div>
  );
}

/**
 * The plan gate: the risk, what changed since the last round, the plan, and an answer to the
 * planner's open questions that goes with the approval. A approves; the build starts after the
 * undo window.
 */
export function PlanGate({ detail, summary, revision, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const plan = useJsonArtifact(summary.issueNumber, "plan", plannerOutputSchema, revision);
  const round = planRound(detail.state.history);
  const changed = detail.plan?.revision ?? null;

  const approve = (): void => {
    if (actions.busy) return;
    const note = answer.trim();
    void send(note === "" ? { action: "approve" } : { action: "approve", note });
  };
  const requestChanges = (): void => setFeedbackOpen(true);

  useShortcuts([{ key: "a", run: approve, labelKey: "desk.board.keys.approve" }]);
  usePaletteActions([
    { id: "gate-approve", label: t("desk.gate.plan.approve"), hint: "A", run: approve },
    { id: "gate-changes", label: t("desk.gate.requestChanges"), run: requestChanges }
  ]);

  return (
    <>
      <RiskLine detail={detail} summary={summary} />
      {changed !== null && (
        <RevisionNote
          title={t("desk.gate.plan.changed", { round: Math.max(1, round - 1) })}
          text={changed}
        />
      )}
      {plan.status === "loading" && <Loading />}
      {plan.status === "missing" && <Muted>{t("desk.artifact.missing")}</Muted>}
      {plan.status === "error" && <FailureText code={plan.code} detail={plan.detail} />}
      {plan.status === "ok" && (
        <PlanGateBody plan={plan.value} answer={answer} onAnswer={setAnswer} />
      )}
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
        hint={t(
          shipsWithoutReview(issueFlowOf(summary), summary.stage)
            ? "desk.gate.plan.hintAutoShip"
            : "desk.gate.plan.hint"
        )}
      >
        <Button disabled={actions.busy} aria-keyshortcuts="A" onClick={approve}>
          {t("desk.gate.plan.approve")}
          <Kbd shortcut="a" />
        </Button>
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
