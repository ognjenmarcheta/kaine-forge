import {
  MAX_FEEDBACK_CHARS,
  type ActionRequestInput,
  type FlowNodeId,
  type IssueDetail,
  type LogEntry
} from "@repo/desk/contracts";
import { Button, ExternalLink, GitPullRequest, Label, Textarea, buttonVariants } from "@repo/ui";
import { useId, useRef, useState } from "react";

import type { ActionWords, IssueActions } from "./gate.actions";
import { ApproveGate } from "./gate.approve";
import { FeedbackForm } from "./gate.feedback";
import { DecideBar, Kbd, type GateBodyProps, type UnsentComments } from "./gate.frame";
import { IntakeGate, NeedsYouGate } from "./gate.needs";
import { PlanGate } from "./gate.plan";
import { ReviewGate } from "./gate.review";
import { ShipDialog } from "./gate.ship-dialog";
import { AgentAvatar } from "../agents/agent.avatar";
import { ReportArtifact } from "../artifacts/artifact.report";
import { IssueFlowProvider, useStageNames } from "../flow/flow.names";
import { agentName, flowStepOf, issueFlowOf } from "../flow/flow.steps";
import { useLanguage, useT } from "../i18n/i18n.t";
import { ranReports } from "../inspector/inspector.model";
import { LogPanel } from "../issue/issue.log";
import { formatClock, relativeTime, safeHttpUrl } from "../shell/shell.format";
import { useShortcuts } from "../shell/shell.keys";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { TimeInStage } from "../shell/shell.time";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import {
  TONE_GLYPH,
  gateModeOf,
  type GateMode,
  type ReadableSummary
} from "../status/status.model";

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

/**
 * The owner's note to the agent that runs now (ADR 0022): it stops, reads the note, and goes on
 * in the same session. The note shows in the live log; a sent note cannot be taken back.
 */
function TellForm({
  agent,
  send,
  onClose
}: {
  readonly agent: string;
  readonly send: GateBodyProps["send"];
  readonly onClose: () => void;
}) {
  const t = useT();
  const id = useId();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const steer = async (): Promise<void> => {
    const submitted = note;
    const text = submitted.trim();
    if (text === "" || sending) return;
    setSending(true);
    try {
      // Clear only what was sent: the owner may have typed on while it was sent.
      if (await send({ action: "steer", note: text })) {
        setNote((current) => (current === submitted ? "" : current));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dk-sec">
      <div className="dk-field">
        <Label htmlFor={`${id}-tell`}>{t("desk.gate.working.tell.label", { agent })}</Label>
        <Textarea
          id={`${id}-tell`}
          value={note}
          rows={2}
          maxLength={MAX_FEEDBACK_CHARS}
          aria-describedby={`${id}-tell-help`}
          onChange={(event) => setNote(event.target.value)}
        />
        <p id={`${id}-tell-help`} className="dk-hint">
          {t("desk.gate.working.steer.help")}
        </p>
      </div>
      <div className="dk-row">
        <Button type="button" disabled={sending || note.trim() === ""} onClick={() => void steer()}>
          {t("desk.gate.working.steer.send")}
        </Button>
        <Button type="button" appearance="ghost" onClick={onClose}>
          {t("desk.common.cancel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * What the item does now: the step, the latest line, and the live log. Pause or Resume (P) and
 * "Tell the agent…" sit side by side: nothing waits on the owner, so neither is primary.
 */
function RunningGate({ summary, send }: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const { language } = useLanguage();
  const now = useNow();
  const { state } = useDesk();
  const [telling, setTelling] = useState(false);
  const logs = state.logs[summary.issueNumber] ?? EMPTY;
  const step = flowStepOf(issueFlowOf(summary), summary.stage);
  const agent = step?.agent ?? null;
  const who = agent === null ? null : agentName(t, agent, null);
  // What the agent said last; before its first line, what the engine said last.
  const latest =
    logs.filter((entry) => entry.kind === "agent").at(-1) ??
    logs.filter((entry) => entry.kind === "log").at(-1);
  // Pause and Resume stop work rather than start it, so they stay available while a step runs.
  const toggle = (): void => {
    void send(summary.paused ? { action: "resume" } : { action: "pause" });
  };
  const label = t(summary.paused ? "desk.gate.working.resume" : "desk.gate.working.pause");

  useShortcuts([{ key: "p", run: toggle, labelKey: "desk.gate.keys.pause" }]);
  usePaletteActions([{ id: "gate-pause", label, hint: "P", run: toggle }]);

  return (
    <>
      {summary.paused ? (
        <div className="dk-banner dk-banner-information" role="status">
          <span className="dk-g" aria-hidden="true">
            {TONE_GLYPH.neutral}
          </span>
          <div className="dk-grow">
            <b>
              {summary.pausedAt === null
                ? t("desk.gate.working.paused")
                : t("desk.gate.working.pausedAt", {
                    time: formatClock(summary.pausedAt, language)
                  })}
            </b>{" "}
            <span>{t("desk.gate.working.pausedBack")}</span>
          </div>
        </div>
      ) : (
        <p className="dk-row" role="status">
          <span className="dk-spin" aria-hidden="true" />
          <b>{names.stage(summary.stage)}</b>
          <span className="dk-t-sub">
            {latest === undefined ? t("desk.gate.working.starting") : latest.text}
          </span>
          <span className="dk-t-subtlest">
            <TimeInStage summary={summary} now={now} />
          </span>
        </p>
      )}
      <div className="dk-sec">
        <h3 className="dk-h-sec">{t("desk.gate.working.liveLog")}</h3>
        <LogPanel issueNumber={summary.issueNumber} />
      </div>
      {telling && who !== null && (
        // Keyed by step, so a note written for one agent never goes to the next.
        <TellForm key={summary.stage} agent={who} send={send} onClose={() => setTelling(false)} />
      )}
      <div className="dk-decide">
        <Button
          type="button"
          appearance="outline"
          spacing="spacious"
          aria-keyshortcuts="P"
          onClick={toggle}
        >
          {label}
          <Kbd shortcut="p" />
        </Button>
        {who !== null && !summary.paused && (
          <Button
            type="button"
            appearance="outline"
            aria-expanded={telling}
            onClick={() => setTelling((open) => !open)}
          >
            {agent !== null && <AgentAvatar avatar={agent.avatar} />}
            {t("desk.gate.working.tell.open", { agent: who })}
          </Button>
        )}
        <span className="dk-note">
          {who === null ? `${t("desk.gate.working.noAgent")} ` : ""}
          {t("desk.gate.working.pauseHelp")} {t("desk.gate.working.moreHelp")}
        </span>
      </div>
    </>
  );
}

/** The draft PR is open: the owner merges on GitHub, then checks it here or sends its feedback. */
function PrOpenGate({ detail, actions, send, titleId }: GateBodyProps) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  const check = detail.state.prCheck;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const prUrl = safeHttpUrl(detail.state.prUrl);
  return (
    <>
      <p className="dk-lede">{t("desk.gate.intro.pr-open")}</p>
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
      <p className="dk-hint">{t("desk.gate.prOpen.youMerge")}</p>
      {check !== null && check !== undefined && (
        <p className="dk-t-sub">
          {t("desk.pulls.checked", {
            when: relativeTime(check.at, now, language),
            failing: check.failingChecks.length,
            comments: check.comments
          })}
          {check.failingChecks.length > 0 && ` ${check.failingChecks.join(", ")}.`}
          {check.skipped.length > 0 &&
            ` ${t("desk.pulls.skipped", { authors: check.skipped.join(", ") })}`}
        </p>
      )}
      <DecideBar labelledBy={titleId}>
        <Button
          type="button"
          disabled={actions.busy}
          onClick={() => void send({ action: "refresh-pr" })}
        >
          {t("desk.gate.prOpen.check")}
        </Button>
        <Button
          type="button"
          appearance="secondary"
          disabled={actions.busy}
          onClick={() => void send({ action: "check-pr" })}
        >
          {t("desk.pulls.check")}
        </Button>
        <Button
          type="button"
          appearance="secondary"
          disabled={actions.busy}
          aria-expanded={feedbackOpen}
          onClick={() => setFeedbackOpen((open) => !open)}
        >
          {t("desk.gate.prOpen.sendFeedback")}
        </Button>
        {prUrl !== null && (
          <a href={prUrl} target="_blank" rel="noreferrer noopener" className={PR_SUBTLE_LINK}>
            <GitPullRequest aria-hidden="true" className="dk-ic" />
            {t("desk.gate.prOpen.openPr")}
            <ExternalLink aria-hidden="true" className="dk-ic" />
          </a>
        )}
      </DecideBar>
    </>
  );
}

/**
 * A finished flow's result: the last report that ran, on the card, and a button for each report
 * before it, which opens in the side sheet. Nothing when the flow ran no report.
 */
function FinishedReports({ detail, revision, onOpenResult }: GateBodyProps) {
  const t = useT();
  const names = useStageNames();
  const reports = ranReports(detail);
  const last = reports.at(-1);
  if (last === undefined) return null;
  const others = reports.slice(0, -1);
  return (
    <>
      <section className="dk-sec">
        <h3>{t("desk.gate.finished.report", { step: names.stage(last.stepId) })}</h3>
        <ReportArtifact
          issueNumber={detail.summary.issueNumber}
          agentId={last.agentId}
          revision={revision}
        />
      </section>
      {others.length > 0 && (
        <section className="dk-sec">
          <h3>{t("desk.gate.finished.otherReports")}</h3>
          <div className="dk-row">
            {others.map((report) => (
              <Button
                type="button"
                key={report.stepId}
                appearance="secondary"
                onClick={() => onOpenResult(report.stepId)}
              >
                {names.stage(report.stepId)}
              </Button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Shipped, cancelled or finished: what that means, and the pull request when there is one. */
function EndedGate(props: GateBodyProps) {
  const { detail, summary } = props;
  const t = useT();
  const mode = gateModeOf(summary);
  const prUrl = safeHttpUrl(detail.state.prUrl);
  return (
    <>
      <p className="dk-lede">{t(`desk.gate.intro.${mode}`)}</p>
      {mode === "finished" && <FinishedReports {...props} />}
      {prUrl !== null && (
        <p>
          <a href={prUrl} target="_blank" rel="noreferrer noopener" className={PR_LINK}>
            <GitPullRequest aria-hidden="true" className="dk-ic" />
            {t("desk.gate.shipped.openPr")}
            <ExternalLink aria-hidden="true" className="dk-ic" />
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
    readonly unsent: UnsentComments | null;
  }>({ open: false, unviewed: [], unsent: null });
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
    onShip: (unviewed, unsent = null) => setShip({ open: true, unviewed, unsent })
  };

  return (
    <section className="dk-card dk-decision" data-mode={mode} aria-labelledby={titleId}>
      <div>
        <div className="dk-card-h">
          <h2 ref={heading} tabIndex={-1} id={titleId} className="dk-h-card dk-grow">
            {t(`desk.gate.title.${titleMode}`, {
              // A stop names the step it stopped in; every other card names its own step.
              stage: names.stage(
                mode === "needs-you" ? (summary.resumeStage ?? summary.stage) : summary.stage
              )
            })}
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
          {byline !== undefined && <span className="dk-t-sub dk-t-small">{t(byline)}</span>}
          {resultNode !== undefined && (
            <Button
              type="button"
              appearance="ghost"
              spacing="compact"
              className="dk-btn"
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
        {mode === "idle" && <p className="dk-t-sub">{t("desk.gate.intro.idle")}</p>}
      </div>
      <ShipDialog
        issueNumber={summary.issueNumber}
        pullRequest={detail.state.prNumber ?? null}
        open={ship.open}
        onOpenChange={(open) => setShip((was) => ({ ...was, open }))}
        actions={actions}
        unviewed={ship.unviewed}
        unsent={ship.unsent}
      />
    </section>
  );
}
