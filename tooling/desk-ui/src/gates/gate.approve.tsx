import { Button } from "@repo/ui";
import { useState } from "react";

import { FeedbackForm, targetLabel } from "./gate.feedback";
import { DecideBar, Kbd, type GateBodyProps } from "./gate.frame";
import { sendBackTargets } from "./gate.model";
import { issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { useShortcuts } from "../shell/shell.keys";
import { usePaletteActions } from "../shell/shell.palette";

/** An approval here is not a plan approval: the toasts say what it does in this flow. */
const APPROVE_WORDS = {
  pending: "desk.undo.pending.gateApprove",
  done: "desk.action.done.gateApprove"
} as const;

/**
 * A gate of the flow that neither approves a plan nor ships: the owner approves it, and the
 * engine runs the next step, or sends the work back to one of the steps the gate names. A
 * approves; the next step starts after the undo window.
 */
export function ApproveGate({ summary, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const flow = issueFlowOf(summary);
  const targets = sendBackTargets(flow, summary.stage);

  const approve = (): void => {
    if (!actions.busy) void send({ action: "approve" }, APPROVE_WORDS);
  };

  useShortcuts([{ key: "a", run: approve, labelKey: "desk.board.keys.approve" }]);
  usePaletteActions([
    { id: "gate-approve", label: t("desk.gate.approve.button"), hint: "A", run: approve },
    ...(targets.length === 0
      ? []
      : [
          {
            id: "gate-changes",
            label: t("desk.gate.requestChanges"),
            run: () => setFeedbackOpen(true)
          }
        ])
  ]);

  return (
    <>
      <p className="desk-plain">{t("desk.gate.intro.gate")}</p>
      {targets.length > 0 && (
        <p className="desk-muted">
          {t("desk.gate.approve.targets", {
            targets: targets.map((id) => targetLabel(t, flow, id)).join(", ")
          })}
        </p>
      )}
      {feedbackOpen && (
        <FeedbackForm
          targets={targets}
          busy={actions.busy}
          onCancel={() => setFeedbackOpen(false)}
          onSend={async (to, text) => {
            const sent = await send({ action: "feedback", to, text });
            if (sent) setFeedbackOpen(false);
            return sent;
          }}
        />
      )}
      <DecideBar labelledBy={titleId} hint={t("desk.gate.approve.hint")}>
        <Button disabled={actions.busy} aria-keyshortcuts="A" onClick={approve}>
          {t("desk.gate.approve.button")}
          <Kbd shortcut="a" />
        </Button>
        {targets.length > 0 && (
          <Button
            appearance="secondary"
            disabled={actions.busy}
            aria-expanded={feedbackOpen}
            onClick={() => setFeedbackOpen((open) => !open)}
          >
            {t("desk.gate.requestChanges")}
          </Button>
        )}
      </DecideBar>
    </>
  );
}
