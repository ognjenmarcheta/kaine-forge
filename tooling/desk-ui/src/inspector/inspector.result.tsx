import type { ArtifactId, FlowNode, IssueDetail } from "@repo/desk/contracts";
import type { ReactNode } from "react";

import { stageRoleOf } from "./inspector.model";
import { BuildArtifact } from "../artifacts/artifact.build";
import { CheckArtifact } from "../artifacts/artifact.check";
import { DiffArtifact } from "../artifacts/artifact.diff";
import { PlanArtifact } from "../artifacts/artifact.plan";
import { ReviewView } from "../artifacts/artifact.review";
import { TicketArtifact } from "../artifacts/artifact.ticket";
import { useT } from "../i18n/i18n.t";
import { Muted } from "../shell/shell.ui";

/**
 * An artifact the issue has written, or a short line when it has not. The sheet shows the full
 * result as soon as it opens, so a file that does not exist yet costs no request.
 */
function Written({
  detail,
  id,
  children
}: {
  readonly detail: IssueDetail;
  readonly id: ArtifactId;
  readonly children: ReactNode;
}) {
  const t = useT();
  return detail.artifacts.some((entry) => entry.id === id && entry.present) ? (
    children
  ) : (
    <Muted>{t("desk.artifact.missing")}</Muted>
  );
}

/** The full result of one stage: the artifact it wrote, under the stage in the side sheet. */
export function StageResult({
  node,
  detail,
  revision
}: {
  readonly node: FlowNode;
  readonly detail: IssueDetail;
  readonly revision: string;
}) {
  const t = useT();
  const issueNumber = detail.summary.issueNumber;
  const diff = (
    <Written detail={detail} id="diff">
      <DiffArtifact issueNumber={issueNumber} revision={revision} />
    </Written>
  );
  const role = stageRoleOf(detail, node.id);
  switch (role) {
    case "ticket":
      return (
        <Written detail={detail} id="ticket">
          <TicketArtifact
            issueNumber={issueNumber}
            revision={revision}
            contract={detail.contract}
          />
        </Written>
      );
    case "plan":
    case "plan-gate":
      return (
        <Written detail={detail} id="plan">
          <PlanArtifact issueNumber={issueNumber} revision={revision} />
        </Written>
      );
    case "change":
      return (
        <>
          <Written detail={detail} id="build">
            <BuildArtifact issueNumber={issueNumber} revision={revision} />
          </Written>
          {diff}
        </>
      );
    case "check":
      return (
        <Written detail={detail} id="check-report">
          <CheckArtifact issueNumber={issueNumber} revision={revision} />
        </Written>
      );
    case "review":
    case "ship-gate":
      return (
        <>
          {detail.review === null ? (
            <Muted>{t("desk.artifact.missing")}</Muted>
          ) : (
            <ReviewView review={detail.review} />
          )}
          {role === "ship-gate" && diff}
        </>
      );
    case "ship":
    case "pr-wait":
      return diff;
    default:
      return null;
  }
}
