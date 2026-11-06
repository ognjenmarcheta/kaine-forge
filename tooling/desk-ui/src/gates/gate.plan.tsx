import { plannerOutputSchema, type IssueDetail } from "@repo/desk/contracts";
import { Button } from "@repo/ui";
import { useState } from "react";

import { FeedbackForm } from "./gate.feedback";
import { DecideBar, Kbd, RevisionNote, type GateBodyProps } from "./gate.frame";
import { lastAsked, planRound, sendBackTargets, shipsWithoutReview } from "./gate.model";
import { RiskRecord } from "./gate.record";
import { PlanGateBody } from "../artifacts/artifact.plan";
import { ReportArtifact } from "../artifacts/artifact.report";
import { useJsonArtifact } from "../artifacts/artifact.use";
import { useStageNames } from "../flow/flow.names";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { reportsBefore } from "../inspector/inspector.model";
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
    <div className={risk === "high" ? "dk-riskbox dk-high" : "dk-riskbox"}>
      <span>
        <StatusChip tone={PLAN_RISK_TONE[risk]}>{t(PLAN_RISK_KEY[risk])}</StatusChip>
      </span>
      <div className="dk-stack dk-gap-100">
        {reasons.length > 0 && (
          <ul className="dk-t-small">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <RiskRecord risk={risk} />
      </div>
    </div>
  );
}

/**
 * The plan gate: the risk, what changed since the last round, the plan, the reports of the report
 * steps between the plan and the gate, and an answer to the planner's open questions that goes
 * with the approval. A approves; the build starts after the undo window.
 */
export function PlanGate({ detail, summary, revision, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const [answer, setAnswer] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const plan = useJsonArtifact(summary.issueNumber, "plan", plannerOutputSchema, revision);
  const round = planRound(detail.state.history);
  const changed = detail.plan?.revision ?? null;
  // Without the planner's own list, a later round shows what the owner asked for.
  const asked = changed === null && round > 1 ? lastAsked(detail.state.history) : null;

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
      {asked !== null && (
        <RevisionNote
          title={t("desk.gate.plan.asked", { round: Math.max(1, round - 1) })}
          text={asked}
        />
      )}
      {plan.status === "loading" && <Loading />}
      {plan.status === "missing" && <Muted>{t("desk.artifact.missing")}</Muted>}
      {plan.status === "error" && <FailureText code={plan.code} detail={plan.detail} />}
      {plan.status === "ok" && (
        <PlanGateBody plan={plan.value} answer={answer} onAnswer={setAnswer} />
      )}
      {reportsBefore(detail, summary.stage).map((report) => (
        <section key={report.stepId} className="dk-sec">
          <h3>{t("desk.gate.finished.report", { step: names.stage(report.stepId) })}</h3>
          <ReportArtifact
            issueNumber={summary.issueNumber}
            agentId={report.agentId}
            revision={revision}
          />
        </section>
      ))}
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
        <Button
          type="button"
          spacing="spacious"
          disabled={actions.busy}
          aria-keyshortcuts="A"
          onClick={approve}
        >
          {t("desk.gate.plan.approve")}
          <Kbd shortcut="a" />
        </Button>
        <Button
          type="button"
          appearance="outline"
          spacing="spacious"
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
