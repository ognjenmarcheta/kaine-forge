import { buildFlowModel, type FlowNodeId } from "@repo/desk/contracts";
import { Card, Skeleton } from "@repo/ui";
import { useMemo, useState } from "react";

import { useIssueDetail } from "./issue.detail.use";
import { StageDrawer } from "./issue.drawer";
import { IssueHeader } from "./issue.header";
import { useIssueLog } from "./issue.log";
import { IssueTabs } from "./issue.tabs";
import { FlowGraph } from "../flow/flow.graph";
import { FlowLegend, FlowStagesText, FlowStepper } from "../flow/flow.stepper";
import { useIssueActions } from "../gates/gate.actions";
import { useGateLayout } from "../gates/gate.panel";
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
    <div className="desk-issue-grid" aria-busy="true">
      <div className="desk-inspector desk-inspector--loading">
        <Skeleton className="desk-skeleton desk-skeleton--title" />
        <Skeleton className="desk-skeleton desk-skeleton--tiles" />
        <Skeleton className="desk-skeleton desk-skeleton--block" />
      </div>
      <div className="desk-issue-main">
        <Card className="desk-panel">
          <h2>{t("desk.flow.title")}</h2>
          <Skeleton className="desk-skeleton desk-skeleton--graph" />
          <span className="desk-sr-only" role="status">
            {t("desk.common.loading")}
          </span>
        </Card>
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
  // Measured here, before the detail loads, so the inspector mounts in its final layout.
  const layout = useGateLayout();
  const [picked, setPicked] = useState<FlowNodeId | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
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
  if (detail === undefined || flow === undefined) {
    return (
      <>
        <IssueHeader summary={summary} />
        {error !== null && <FailureText code={error.code} detail={error.detail} />}
        <DetailSkeleton />
      </>
    );
  }
  const selected = resolveSelection(picked, flow);
  return (
    <>
      <IssueHeader summary={summary} />
      {error !== null && <FailureText code={error.code} detail={error.detail} />}
      <div className="desk-issue-grid">
        <Inspector
          detail={detail}
          summary={summary}
          flow={flow}
          selected={selected}
          onSelect={setPicked}
          revision={revision}
          actions={actions}
          onOpenResult={() => setResultOpen(true)}
          onRemoved={() => navigate({ view: "board" })}
          layout={layout}
        />
        <div className="desk-issue-main">
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
            <FlowStagesText model={flow} needsYouReason={summary.needsYouReason} />
            <FlowStepper
              model={flow}
              selected={selected}
              onSelect={setPicked}
              needsYouReason={summary.needsYouReason}
            />
          </Card>
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
      <StageDrawer
        nodeId={resultOpen ? selected : null}
        detail={detail}
        revision={revision}
        onClose={() => setResultOpen(false)}
      />
    </>
  );
}
