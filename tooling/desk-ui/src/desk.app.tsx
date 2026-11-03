import { Button } from "@repo/ui";

import { AgentEditor } from "./agents/agents.editor";
import { AgentsView } from "./agents/agents.view";
import { FlowEditor } from "./flows/flows.editor";
import { FlowsView } from "./flows/flows.view";
import { useT } from "./i18n/i18n.t";
import { InboxView } from "./inbox/inbox.view";
import { InsightsView } from "./insights/insights.view";
import { IssueView } from "./issue/issue.view";
import { JobView } from "./jobs/job.view";
import { LabView } from "./lab/lab.view";
import { ScorecardView } from "./scorecard/scorecard.view";
import { SetupView } from "./setup/setup.view";
import { Shell } from "./shell/shell.layout";
import { useRouter } from "./shell/shell.router";
import { Loading } from "./shell/shell.ui";
import { useDesk } from "./state/desk.provider";
import { WorkView } from "./work/work.view";

function SessionGate() {
  const t = useT();
  const { state, reloadIssues } = useDesk();
  if (state.session === "unauthorized") {
    return (
      <div className="dk-empty" role="alert">
        <h1 className="dk-h-page">{t("desk.session.lostTitle")}</h1>
        <p>{t("desk.session.lost")}</p>
      </div>
    );
  }
  if (state.session === "unavailable") {
    return (
      <div className="dk-empty" role="alert">
        <h1 className="dk-h-page">{t("desk.session.unavailableTitle")}</h1>
        <p>{t("desk.session.unavailable")}</p>
        <Button type="button" onClick={() => void reloadIssues()}>
          {t("desk.session.retry")}
        </Button>
      </div>
    );
  }
  return <Loading />;
}

function Routes() {
  const { route } = useRouter();
  switch (route.view) {
    case "inbox":
      return <InboxView />;
    case "work":
      return <WorkView />;
    case "flows":
      return <FlowsView />;
    case "flow":
      return <FlowEditor key={route.flowId} flowId={route.flowId} />;
    case "agents":
      return <AgentsView />;
    case "agent":
      return <AgentEditor key={route.agentId ?? ""} agentId={route.agentId} />;
    case "setup":
      return <SetupView />;
    case "insights":
      return <InsightsView />;
    case "scorecard":
      return <ScorecardView key={route.jobId ?? 0} jobId={route.jobId} />;
    case "job":
      return <JobView key={route.jobId} jobId={route.jobId} />;
    case "lab":
      return <LabView />;
    case "issue":
      return <IssueView key={route.issueNumber} issueNumber={route.issueNumber} />;
  }
}

export function DeskApp() {
  const { state } = useDesk();
  const { route } = useRouter();
  // The lab calls no desk API, so it opens without a session: `pnpm lab` runs no desk server.
  const open = state.session === "ready" || route.view === "lab";
  return <Shell>{open ? <Routes /> : <SessionGate />}</Shell>;
}
