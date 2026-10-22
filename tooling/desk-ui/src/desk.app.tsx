import { Button } from "@repo/ui";

import { AgentEditor } from "./agents/agents.editor";
import { AgentsView } from "./agents/agents.view";
import { BoardView } from "./board/board.view";
import { FlowEditor } from "./flows/flows.editor";
import { FlowsView } from "./flows/flows.view";
import { HealthView } from "./health/health.view";
import { useT } from "./i18n/i18n.t";
import { IssueView } from "./issue/issue.view";
import { Shell } from "./shell/shell.layout";
import { useRouter } from "./shell/shell.router";
import { Loading } from "./shell/shell.ui";
import { useDesk } from "./state/desk.provider";
import { StatsView } from "./stats/stats.view";

function SessionGate() {
  const t = useT();
  const { state, reloadIssues } = useDesk();
  if (state.session === "unauthorized") {
    return (
      <div className="desk-session" role="alert">
        <h1>{t("desk.session.lostTitle")}</h1>
        <p>{t("desk.session.lost")}</p>
      </div>
    );
  }
  if (state.session === "unavailable") {
    return (
      <div className="desk-session" role="alert">
        <h1>{t("desk.session.unavailableTitle")}</h1>
        <p>{t("desk.session.unavailable")}</p>
        <Button onClick={() => void reloadIssues()}>{t("desk.session.retry")}</Button>
      </div>
    );
  }
  return <Loading />;
}

function Routes() {
  const { route } = useRouter();
  switch (route.view) {
    case "board":
      return <BoardView />;
    case "flows":
      return <FlowsView />;
    case "flow":
      return <FlowEditor key={route.flowId} flowId={route.flowId} />;
    case "agents":
      return <AgentsView />;
    case "agent":
      return <AgentEditor key={route.agentId ?? ""} agentId={route.agentId} />;
    case "health":
      return <HealthView />;
    case "stats":
      return <StatsView />;
    case "issue":
      return <IssueView key={route.issueNumber} issueNumber={route.issueNumber} />;
  }
}

export function DeskApp() {
  const { state } = useDesk();
  return <Shell>{state.session === "ready" ? <Routes /> : <SessionGate />}</Shell>;
}
