import type { ActionRequestInput, FlowNodeId, IssueDetail, LogEntry } from "@repo/desk/contracts";
import { Button, Card, ExternalLink, GitPullRequest, Spinner, buttonVariants } from "@repo/ui";
import { useId, useRef, useState } from "react";

import type { ActionWords, IssueActions } from "./gate.actions";
import { ApproveGate } from "./gate.approve";
import { FeedbackForm } from "./gate.feedback";
import { DecideBar, Kbd, type GateBodyProps } from "./gate.frame";
import { IntakeGate, NeedsYouGate } from "./gate.needs";
import { PlanGate } from "./gate.plan";
import { ReviewGate } from "./gate.review";
import { ShipDialog } from "./gate.ship-dialog";
import { IssueFlowProvider, useStageNames } from "../flow/flow.names";
import { issueFlowOf } from "../flow/flow.steps";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatClock, safeHttpUrl } from "../shell/shell.format";
import { useShortcuts } from "../shell/shell.keys";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { TimeInStage } from "../shell/shell.time";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { gateModeOf, type GateMode, type ReadableSummary } from "../status/status.model";

const PR_LINK = buttonVariants({ appearance: "default" });
const PR_SUBTLE_LINK = buttonVariants({ appearance: "subtle" });
const EMPTY: readonly LogEntry[] = [];

/** The card the issue shows: a gate, a stop, a run, or the end. A paused issue between stages is a run. */
type CardMode = GateMode | "intake";

const cardModeOf = (summary: ReadableSummary): CardMode => {
  const mode = gateModeOf(summary);
  if (mode === "needs-you" && summary.resumeStage === "intake") return "intake";
  if (mode === "idle" && summary.paused) return "working";
  return mode;
};

/** Who wrote what the card shows. */
const BYLINE: Partial<Record<CardMode, string>> = {
  "plan-gate": "desk.gate.by.planner",
  "pr-review": "desk.gate.by.reviewer"
};

/** Cards whose button opens the full result of the gate's stage. */
const SHOWS_RESULT: ReadonlySet<CardMode> = new Set(["plan-gate", "pr-review"]);

/** What the issue does now: the stage, the latest agent line, the time, and Pause or Resume (P). */
function RunningGate({ summary, send }: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const { language } = useLanguage();
  const now = useNow();
  const { state } = useDesk();
  const logs = state.logs[summary.issueNumber] ?? EMPTY;
  // What the agent said last; before its first line, what the engine said last.
  const latest =
    logs.filter((entry) => entry.kind === "agent").at(-1) ??
    logs.filter((entry) => entry.kind === "log").at(-1);
  // Pause and Resume stop work rather than start it, so they stay available while a stage runs.
  const toggle = (): void => {
    void send(summary.paused ? { action: "resume" } : { action: "pause" });
  };
  const label = t(summary.paused ? "desk.gate.working.resume" : "desk.gate.working.pause");

  useShortcuts([{ key: "p", run: toggle, labelKey: "desk.gate.keys.pause" }]);
  usePaletteActions([{ id: "gate-pause", label, hint: "P", run: toggle }]);

  return (
    <>
      <p className="desk-nowline" role="status">
        {!summary.paused && (
          <Spinner size="sm" label={t("desk.common.loading")} aria-hidden="true" />
        )}
        <strong>{names.stage(summary.stage)}</strong>
        <span className="desk-nowline__text">
          {latest === undefined ? t("desk.gate.working.starting") : latest.text}
        </span>
        <span className="desk-muted">
          <TimeInStage summary={summary} now={now} />
        </span>
      </p>
      <p className="desk-muted">{t("desk.gate.intro.working")}</p>
      <div className="desk-gate__row">
        <Button appearance="secondary" aria-keyshortcuts="P" onClick={toggle}>
          {label}
          <Kbd shortcut="p" />
        </Button>
        {summary.paused ? (
          <span className="desk-paused-note">
            {summary.pausedAt === null
              ? t("desk.gate.working.paused")
              : t("desk.gate.working.pausedAt", {
                  time: formatClock(summary.pausedAt, language)
                })}
          </span>
        ) : (
          <span className="desk-muted">{t("desk.gate.working.pauseHelp")}</span>
        )}
      </div>
    </>
  );
}

/** The draft PR is open: the owner merges on GitHub, then checks it here or sends its feedback. */
function PrOpenGate({ detail, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const prUrl = safeHttpUrl(detail.state.prUrl);
  return (
    <>
      <p className="desk-plain">{t("desk.gate.intro.pr-open")}</p>
      {feedbackOpen && (
        <FeedbackForm
          targets={[]}
          fromPr
          busy={actions.busy}
          onCancel={() => setFeedbackOpen(false)}
          onSend={async (_to, text) => {
            const sent = await send(
              text.trim() === "" ? { action: "pr-feedback" } : { action: "pr-feedback", text }
            );
            if (sent) setFeedbackOpen(false);
            return sent;
          }}
        />
      )}
      <p className="desk-note">{t("desk.gate.prOpen.youMerge")}</p>
      <DecideBar labelledBy={titleId}>
        <Button disabled={actions.busy} onClick={() => void send({ action: "refresh-pr" })}>
          {t("desk.gate.prOpen.check")}
        </Button>
        <Button
          appearance="secondary"
          disabled={actions.busy}
          aria-expanded={feedbackOpen}
          onClick={() => setFeedbackOpen((open) => !open)}
        >
          {t("desk.gate.prOpen.sendFeedback")}
        </Button>
        {prUrl !== null && (
          <a href={prUrl} target="_blank" rel="noreferrer noopener" className={PR_SUBTLE_LINK}>
            <GitPullRequest aria-hidden="true" className="desk-icon" />
            {t("desk.gate.prOpen.openPr")}
            <ExternalLink aria-hidden="true" className="desk-icon" />
          </a>
        )}
      </DecideBar>
    </>
  );
}

/** Shipped, cancelled or finished: what that means, and the pull request when there is one. */
function EndedGate({ detail, summary }: GateBodyProps) {
  const t = useT();
  const mode = gateModeOf(summary);
  const prUrl = safeHttpUrl(detail.state.prUrl);
  return (
    <>
      <p className="desk-plain">{t(`desk.gate.intro.${mode}`)}</p>
      {prUrl !== null && (
        <p>
          <a href={prUrl} target="_blank" rel="noreferrer noopener" className={PR_LINK}>
            <GitPullRequest aria-hidden="true" className="desk-icon" />
            {t("desk.gate.shipped.openPr")}
            <ExternalLink aria-hidden="true" className="desk-icon" />
          </a>
        </p>
      )}
    </>
  );
}

export interface GatePanelProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  readonly revision: string;
  readonly actions: IssueActions;
  readonly onOpenResult: (node: FlowNodeId) => void;
  readonly onShowTrace: () => void;
}

/**
 * The decision card of the issue page: what the owner decides now, or what runs. Each mode has
 * its own body and keys; the buttons sit in a bar at the bottom of the card. When an action
 * works, focus moves to the card heading: the pressed button may be gone. Its stages are named
 * from the issue's own flow.
 */
export function GatePanel(props: GatePanelProps) {
  return (
    <IssueFlowProvider flow={issueFlowOf(props.summary)}>
      <DecisionCard {...props} />
    </IssueFlowProvider>
  );
}

function DecisionCard(props: GatePanelProps) {
  const { detail, summary, actions, onOpenResult } = props;
  const t = useT();
  const names = useStageNames();
  const id = useId();
  const titleId = `${id}-title`;
  const heading = useRef<HTMLHeadingElement>(null);
  const [ship, setShip] = useState<{
    readonly open: boolean;
    readonly unviewed: readonly string[];
  }>({ open: false, unviewed: [] });
  const mode = cardModeOf(summary);
  const titleMode = mode === "intake" ? "needs-you" : mode;
  const byline = BYLINE[mode];
  const resultNode: FlowNodeId | undefined = SHOWS_RESULT.has(mode) ? summary.stage : undefined;

  const send = async (request: ActionRequestInput, words?: ActionWords): Promise<boolean> => {
    const settled = await (words === undefined
      ? actions.run(request)
      : actions.run(request, words));
    const worked = settled.kind === "done";
    if (worked) heading.current?.focus();
    return worked;
  };
  const body: GateBodyProps = {
    ...props,
    send,
    titleId,
    onShip: (unviewed) => setShip({ open: true, unviewed })
  };

  return (
    <Card className="desk-panel desk-decision" data-mode={mode}>
      <section aria-labelledby={titleId}>
        <div className="desk-decision__head">
          <h2 ref={heading} tabIndex={-1} id={titleId} className="desk-decision__title">
            {t(`desk.gate.title.${titleMode}`, { stage: names.stage(summary.stage) })}
          </h2>
          {mode === "intake" && <StatusChip tone="danger">{t("desk.intake.stopped")}</StatusChip>}
          {mode === "pr-open" && (
            <StatusChip tone="warning">
              {t("desk.gate.prOpen.rounds", {
                round: summary.prRound,
                limit: summary.prRoundLimit
              })}
            </StatusChip>
          )}
          {byline !== undefined && <span className="desk-decision__by">{t(byline)}</span>}
          {resultNode !== undefined && (
            <Button
              appearance="ghost"
              spacing="compact"
              className="desk-decision__open"
              onClick={() => onOpenResult(resultNode)}
            >
              {t("desk.inspector.openResult")}
            </Button>
          )}
        </div>
        {mode === "plan-gate" && <PlanGate {...body} />}
        {mode === "pr-review" && <ReviewGate {...body} />}
        {mode === "gate" && <ApproveGate {...body} />}
        {mode === "needs-you" && <NeedsYouGate {...body} />}
        {mode === "intake" && <IntakeGate {...body} />}
        {mode === "working" && <RunningGate {...body} />}
        {mode === "pr-open" && <PrOpenGate {...body} />}
        {(mode === "shipped" || mode === "cancelled" || mode === "finished") && (
          <EndedGate {...body} />
        )}
        {mode === "idle" && <p className="desk-muted">{t("desk.gate.intro.idle")}</p>}
      </section>
      <ShipDialog
        issueNumber={summary.issueNumber}
        pullRequest={detail.state.prNumber ?? null}
        open={ship.open}
        onOpenChange={(open) => setShip((was) => ({ ...was, open }))}
        actions={actions}
        unviewed={ship.unviewed}
      />
    </Card>
  );
}
