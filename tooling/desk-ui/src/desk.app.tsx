import { Button } from "@repo/ui";

import { BoardView } from "./board/board.view";
import { HealthView } from "./health/health.view";
import { useT } from "./i18n/i18n.t";
import { IssueView } from "./issue/issue.view";
import { Shell } from "./shell/shell.layout";
import { useRouter } from "./shell/shell.router";
import { Loading } from "./shell/shell.ui";
import { useDesk } from "./state/desk.provider";

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
    case "health":
      return <HealthView />;
    case "issue":
      return <IssueView key={route.issueNumber} issueNumber={route.issueNumber} />;
  }
}

export function DeskApp() {
  const { state } = useDesk();
  return <Shell>{state.session === "ready" ? <Routes /> : <SessionGate />}</Shell>;
}
