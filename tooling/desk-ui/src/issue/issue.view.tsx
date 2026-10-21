import { buildFlowModel, type FlowNodeId } from "@repo/desk/contracts";
import { Card, Skeleton } from "@repo/ui";
import { useMemo, useRef, useState } from "react";

import { useIssueDetail } from "./issue.detail.use";
import { StageDrawer } from "./issue.drawer";
import { IssueHeader } from "./issue.header";
import { useIssueLog } from "./issue.log";
import { IssueTabs } from "./issue.tabs";
import { FlowGraph } from "../flow/flow.graph";
import { FlowLegend } from "../flow/flow.stepper";
import { useIssueActions } from "../gates/gate.actions";
import { GatePanel } from "../gates/gate.panel";
import { useT } from "../i18n/i18n.t";
import { resolveSelection } from "../inspector/inspector.model";
import { Inspector } from "../inspector/inspector.panel";
import { useNow } from "../shell/shell.now";
import { RouteLink, useRouter } from "../shell/shell.router";
import { FailureText, Loading, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

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
    <div className="desk-issue-cols" aria-busy="true">
      <div className="desk-issue-main">
        <Card className="desk-panel">
          <Skeleton className="desk-skeleton desk-skeleton--title" />
          <Skeleton className="desk-skeleton desk-skeleton--block" />
          <span className="desk-sr-only" role="status">
            {t("desk.common.loading")}
          </span>
        </Card>
      </div>
      <div className="desk-inspector desk-inspector--loading">
        <Skeleton className="desk-skeleton desk-skeleton--title" />
        <Skeleton className="desk-skeleton desk-skeleton--tiles" />
      </div>
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
  const [picked, setPicked] = useState<FlowNodeId | null>(null);
  const [resultNode, setResultNode] = useState<FlowNodeId | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  useIssueLog(issueNumber);
  // The page rebuilds the model with the page clock, so the running stage's duration ticks.
  const flow = useMemo(
    () => (detail === undefined ? undefined : buildFlowModel(detail.state, now)),
    [detail, now]
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

  const running = summary.status === "running" || summary.status === "queued";
  const selected = flow === undefined ? null : resolveSelection(picked, flow);
  const header = (
    <IssueHeader
      summary={summary}
      detail={detail}
      flow={flow}
      selected={selected}
      onSelect={setPicked}
      graphOpen={graphOpen}
      onToggleGraph={() => setGraphOpen((open) => !open)}
      actions={actions}
      onRemoved={() => navigate({ view: "board" })}
    />
  );
  if (detail === undefined || flow === undefined || selected === null) {
    return (
      <>
        {header}
        {error !== null && <FailureText code={error.code} detail={error.detail} />}
        <DetailSkeleton />
      </>
    );
  }
  return (
    <>
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
            selected={selected}
            onSelect={setPicked}
            needsYouReason={summary.needsYouReason}
          />
        </Card>
      )}
      <div className="desk-issue-cols">
        <div className="desk-issue-main">
          <GatePanel
            detail={detail}
            summary={summary}
            revision={revision}
            actions={actions}
            onOpenResult={setResultNode}
            onShowTrace={() => {
              history.current?.scrollIntoView({ block: "start" });
              history.current?.focus({ preventScroll: true });
            }}
          />
          {/* Phase 5b turns this into the History card with the Trace tab; the incident links here. */}
          <div ref={history} tabIndex={-1} className="desk-history">
            <Card className="desk-panel">
              <IssueTabs
                issueNumber={issueNumber}
                history={detail.state.history}
                flow={flow}
                running={running}
              />
            </Card>
          </div>
        </div>
        <Inspector
          detail={detail}
          summary={summary}
          flow={flow}
          selected={selected}
          onSelect={setPicked}
          revision={revision}
          onOpenResult={() => setResultNode(selected)}
        />
      </div>
      <StageDrawer
        nodeId={resultNode}
        detail={detail}
        revision={revision}
        onClose={() => setResultNode(null)}
      />
    </>
  );
}
