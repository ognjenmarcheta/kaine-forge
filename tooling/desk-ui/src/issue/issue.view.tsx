import { buildFlowModel, type FlowNodeId } from "@repo/desk/contracts";
import { Skeleton } from "@repo/ui";
import { useMemo, useRef, useState } from "react";

import { useIssueDetail } from "./issue.detail.use";
import { Details, useDetailsControl } from "./issue.details";
import { Crumb, IssueHeader } from "./issue.header";
import { useIssueLog } from "./issue.log";
import { StepsRail } from "./issue.rail";
import { buildTrace, jumpTargetOf, type TraceLive } from "./issue.trace";
import { FlowGraph } from "../flow/flow.graph";
import { IssueFlowProvider } from "../flow/flow.names";
import { FlowLegend } from "../flow/flow.stepper";
import { issueFlowOf } from "../flow/flow.steps";
import { useIssueActions } from "../gates/gate.actions";
import { GatePanel } from "../gates/gate.panel";
import { useT } from "../i18n/i18n.t";
import { useMarkSeen } from "../inbox/inbox.unread";
import { resolveSelection } from "../inspector/inspector.model";
import { StageSheet } from "../inspector/inspector.panel";
import { useNow } from "../shell/shell.now";
import { usePaletteActions } from "../shell/shell.palette";
import { useRouter } from "../shell/shell.router";
import { FailureText, Loading, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { gateModeOf, hasEnded } from "../status/status.model";
import { issueItem, issueKey } from "../work/work.model";

/** Placeholders of the right size while the detail loads, so nothing jumps when it arrives. */
function DetailSkeleton() {
  const t = useT();
  return (
    <section className="dk-card" aria-busy="true">
      <div className="dk-stack">
        <Skeleton className="dk-skel dk-w60" />
        <Skeleton className="dk-skel dk-w80" />
        <Skeleton className="dk-skel dk-w40" />
        <span className="dk-sr" role="status">
          {t("desk.common.loading")}
        </span>
      </div>
    </section>
  );
}

export function IssueView({ issueNumber }: { readonly issueNumber: number }) {
  const t = useT();
  const { navigate } = useRouter();
  const { state } = useDesk();
  const now = useNow();
  const { summary, detail, revision, error } = useIssueDetail(issueNumber);
  const actions = useIssueActions(issueNumber, summary?.busy ?? false);
  /** The step open in the side sheet, or `null` when the sheet is closed. */
  const [sheet, setSheet] = useState<FlowNodeId | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const detailsRef = useRef<HTMLElement>(null);
  const readable = summary?.readable === true ? summary : undefined;
  const mode = readable === undefined ? "idle" : gateModeOf(readable);
  const running = mode === "working";
  const details = useDetailsControl();
  useIssueLog(issueNumber);
  useMarkSeen(summary === undefined ? null : issueItem(summary));
  // The page rebuilds the model with the page clock, so the running step's duration ticks.
  const flow = useMemo(
    () => (detail === undefined ? undefined : buildFlowModel(detail.state, now)),
    [detail, now]
  );
  const live: TraceLive = hasEnded(mode) ? "ended" : running ? "running" : "waiting";
  const trace = useMemo(
    () =>
      detail === undefined || flow === undefined
        ? undefined
        : buildTrace(detail.state.history, detail.runs, flow, now, live, detail.state.flowSnapshot),
    [detail, flow, now, live]
  );
  const jumpTarget = trace === undefined ? null : jumpTargetOf(trace.steps, mode === "needs-you");

  const showTrace = (stepId: string | null): void => {
    details.showTrace(stepId);
    if (stepId !== null) return;
    detailsRef.current?.scrollIntoView({ block: "start" });
    detailsRef.current?.focus({ preventScroll: true });
  };

  usePaletteActions(
    flow === undefined
      ? []
      : [
          {
            id: "issue-trace",
            label: t("desk.palette.action.trace"),
            run: () => showTrace(trace?.steps.at(-1)?.id ?? null)
          },
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
  const label = t("desk.issue.number", { number: issueNumber });
  if (summary === undefined) {
    return (
      <>
        <Crumb itemKey={issueKey(issueNumber)} label={label} />
        <p className="dk-empty" role="status">
          {t("desk.issue.notFound", { number: issueNumber })}
        </p>
      </>
    );
  }
  if (!summary.readable) {
    return (
      <>
        <Crumb itemKey={issueKey(issueNumber)} label={label} />
        <h1 className="dk-h-page">{label}</h1>
        <div className="dk-banner dk-banner-danger dk-stack" role="alert">
          <p>{t("desk.issue.unreadable")}</p>
          <p className="dk-t-sub">{summary.reason}</p>
          <Pre>{summary.detail}</Pre>
        </div>
      </>
    );
  }

  const header = (
    <IssueHeader
      summary={summary}
      detail={detail}
      graphOpen={graphOpen}
      onToggleGraph={() => setGraphOpen((open) => !open)}
      actions={actions}
      onRemoved={() => navigate({ view: "inbox" })}
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
      <div className="dk-ilayout">
        <div className="dk-icol">
          {graphOpen && (
            <section className="dk-card" aria-label={t("desk.flow.title")}>
              <div className="dk-card-h">
                <h2 className="dk-h-sec dk-grow">{t("desk.flow.title")}</h2>
                <FlowLegend />
              </div>
              <FlowGraph
                model={flow}
                selected={sheet}
                onSelect={(id) => setSheet((open) => (open === id ? null : id))}
                needsYouReason={summary.needsYouReason}
              />
            </section>
          )}
          <GatePanel
            detail={detail}
            summary={summary}
            revision={revision}
            actions={actions}
            onOpenResult={(node) => {
              details.setOutput(node);
              details.setTab("outputs");
              detailsRef.current?.scrollIntoView({ block: "start" });
            }}
            onShowTrace={() => showTrace(jumpTarget?.id ?? null)}
          />
          <Details
            detail={detail}
            flow={flow}
            trace={trace}
            revision={revision}
            running={running}
            needsYou={mode === "needs-you"}
            control={details}
            onInspect={setSheet}
            sectionRef={detailsRef}
          />
        </div>
        <StepsRail
          model={flow}
          detail={detail}
          graphOpen={graphOpen}
          onToggleGraph={() => setGraphOpen((open) => !open)}
          onDetails={setSheet}
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
