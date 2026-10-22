import { buildFlowModel, type FlowNodeId } from "@repo/desk/contracts";
import { Card, Skeleton } from "@repo/ui";
import { useMemo, useRef, useState } from "react";

import { useIssueDetail } from "./issue.detail.use";
import { IssueHeader } from "./issue.header";
import { useIssueLog } from "./issue.log";
import { IssueHistory, useHistoryControl } from "./issue.tabs";
import { buildTrace, jumpTargetOf, type TraceLive } from "./issue.trace";
import { FlowGraph } from "../flow/flow.graph";
import { IssueFlowProvider } from "../flow/flow.names";
import { FlowLegend } from "../flow/flow.stepper";
import { issueFlowOf } from "../flow/flow.steps";
import { useIssueActions } from "../gates/gate.actions";
import { GatePanel } from "../gates/gate.panel";
import { useT } from "../i18n/i18n.t";
import { resolveSelection } from "../inspector/inspector.model";
import { StageSheet } from "../inspector/inspector.panel";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink, useRouter } from "../shell/shell.router";
import { FailureText, Loading, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { gateModeOf } from "../status/status.model";

function BackLink() {
  const t = useT();
  return (
    <RouteLink to={{ view: "board" }} className="desk-back">
      {t("desk.issue.back")}
    </RouteLink>
  );
}

/** Placeholders of the right size while the detail loads, so nothing jumps when it arrives. */
function DetailSkeleton() {
  const t = useT();
  return (
    <div className="desk-issue-main" aria-busy="true">
      <Card className="desk-panel">
        <Skeleton className="desk-skeleton desk-skeleton--title" />
        <Skeleton className="desk-skeleton desk-skeleton--block" />
        <span className="desk-sr-only" role="status">
          {t("desk.common.loading")}
        </span>
      </Card>
    </div>
  );
}

export function IssueView({ issueNumber }: { readonly issueNumber: number }) {
  const t = useT();
  const { navigate } = useRouter();
  const { state } = useDesk();
  const now = useNow();
  const { summary, detail, revision, error } = useIssueDetail(issueNumber);
  const actions = useIssueActions(issueNumber, summary?.busy ?? false);
  /** The stage open in the side sheet, or `null` when the sheet is closed. */
  const [sheet, setSheet] = useState<FlowNodeId | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const historyRef = useRef<HTMLElement>(null);
  const readable = summary?.readable === true ? summary : undefined;
  const mode = readable === undefined ? "idle" : gateModeOf(readable);
  const running = mode === "working";
  const history = useHistoryControl(
    running || mode === "needs-you" || readable?.stage === "intake" || readable?.stage === "setup"
  );
  useIssueLog(issueNumber);
  // The page rebuilds the model with the page clock, so the running stage's duration ticks.
  const flow = useMemo(
    () => (detail === undefined ? undefined : buildFlowModel(detail.state, now)),
    [detail, now]
  );
  const live: TraceLive =
    mode === "shipped" || mode === "cancelled" ? "ended" : running ? "running" : "waiting";
  const trace = useMemo(
    () =>
      detail === undefined || flow === undefined
        ? undefined
        : buildTrace(detail.state.history, detail.runs, flow, now, live, detail.state.flowSnapshot),
    [detail, flow, now, live]
  );
  const jumpTarget = trace === undefined ? null : jumpTargetOf(trace.steps, mode === "needs-you");

  const showTrace = (stepId: string | null): void => {
    history.showTrace(stepId);
    if (stepId !== null) return;
    historyRef.current?.scrollIntoView({ block: "start" });
    historyRef.current?.focus({ preventScroll: true });
  };
  /** A stage from the stepper or the graph: open it in the sheet, or close the sheet on it. */
  const toggleStage = (id: FlowNodeId): void => setSheet((open) => (open === id ? null : id));

  usePaletteActions(
    flow === undefined
      ? []
      : [
          { id: "issue-trace", label: t("desk.palette.action.trace"), run: () => showTrace(null) },
          ...(jumpTarget === null
            ? []
            : [
                {
                  id: "issue-jump",
                  label: t(
                    mode === "needs-you" ? "desk.trace.jump.failure" : "desk.trace.jump.first"
                  ),
                  run: () => showTrace(jumpTarget.id)
                }
              ]),
          {
            id: "issue-inspect",
            label: t("desk.palette.action.inspect"),
            run: () => setSheet(resolveSelection(null, flow))
          }
        ]
  );

  if (!state.issuesLoaded) return <Loading />;
  if (summary === undefined) {
    return (
      <>
        <BackLink />
        <p className="desk-empty" role="status">
          {t("desk.issue.notFound", { number: issueNumber })}
        </p>
      </>
    );
  }
  if (!summary.readable) {
    return (
      <>
        <BackLink />
        <h1>{t("desk.issue.number", { number: issueNumber })}</h1>
        <div className="desk-failure" role="alert">
          <p>{t("desk.issue.unreadable")}</p>
          <p className="desk-muted">{summary.reason}</p>
          <Pre>{summary.detail}</Pre>
        </div>
      </>
    );
  }

  const header = (
    <IssueHeader
      summary={summary}
      detail={detail}
      flow={flow}
      selected={sheet}
      onSelect={toggleStage}
      graphOpen={graphOpen}
      onToggleGraph={() => setGraphOpen((open) => !open)}
      actions={actions}
      onRemoved={() => navigate({ view: "board" })}
    />
  );
  if (detail === undefined || flow === undefined || trace === undefined) {
    return (
      <IssueFlowProvider flow={issueFlowOf(summary)}>
        {header}
        {error !== null && <FailureText code={error.code} detail={error.detail} />}
        <DetailSkeleton />
      </IssueFlowProvider>
    );
  }
  return (
    <IssueFlowProvider flow={issueFlowOf(summary)}>
      {header}
      {error !== null && <FailureText code={error.code} detail={error.detail} />}
      {graphOpen && (
        <Card className="desk-panel desk-pipeline">
          <div className="desk-panel__head">
            <h2>{t("desk.flow.title")}</h2>
            <FlowLegend />
          </div>
          <FlowGraph
            model={flow}
            selected={sheet}
            onSelect={toggleStage}
            needsYouReason={summary.needsYouReason}
          />
        </Card>
      )}
      <div className="desk-issue-main">
        <GatePanel
          detail={detail}
          summary={summary}
          revision={revision}
          actions={actions}
          onOpenResult={setSheet}
          onShowTrace={() => showTrace(jumpTarget?.id ?? null)}
        />
        <IssueHistory
          issueNumber={issueNumber}
          history={detail.state.history}
          flow={flow}
          snapshot={detail.state.flowSnapshot}
          trace={trace}
          running={running}
          needsYou={mode === "needs-you"}
          control={history}
          onJump={() => {
            if (jumpTarget !== null) showTrace(jumpTarget.id);
          }}
          onInspect={setSheet}
          sectionRef={historyRef}
        />
      </div>
      {sheet !== null && (
        <StageSheet
          detail={detail}
          summary={summary}
          flow={flow}
          nodeId={sheet}
          revision={revision}
          onSelect={setSheet}
          onClose={() => setSheet(null)}
        />
      )}
    </IssueFlowProvider>
  );
}
