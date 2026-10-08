import type { FlowNode, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@repo/ui";
import { useRef } from "react";

import { BuildArtifact } from "../artifacts/artifact.build";
import { CheckArtifact } from "../artifacts/artifact.check";
import { DiffArtifact } from "../artifacts/artifact.diff";
import { PlanArtifact } from "../artifacts/artifact.plan";
import { ReviewView } from "../artifacts/artifact.review";
import { TicketArtifact } from "../artifacts/artifact.ticket";
import { useT } from "../i18n/i18n.t";
import { Muted } from "../shell/shell.ui";
import { NODE_TONE, nodeStatusKey, toneClass } from "../status/status.model";

export interface StageDrawerProps {
  readonly nodeId: FlowNodeId | null;
  readonly detail: IssueDetail;
  readonly revision: string;
  readonly onClose: () => void;
}

function StageContent({
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
  switch (node.id) {
    case "ticket":
      return (
        <TicketArtifact issueNumber={issueNumber} revision={revision} contract={detail.contract} />
      );
    case "plan":
    case "plan-gate":
      return <PlanArtifact issueNumber={issueNumber} revision={revision} />;
    case "build":
      return (
        <>
          <BuildArtifact issueNumber={issueNumber} revision={revision} />
          <DiffArtifact issueNumber={issueNumber} revision={revision} />
        </>
      );
    case "check":
      return <CheckArtifact issueNumber={issueNumber} revision={revision} />;
    case "review":
    case "pr-review":
      return (
        <>
          {detail.review === null ? (
            <Muted>{t("desk.artifact.missing")}</Muted>
          ) : (
            <ReviewView review={detail.review} />
          )}
          {node.id === "pr-review" && (
            <DiffArtifact issueNumber={issueNumber} revision={revision} />
          )}
        </>
      );
    case "ship":
      return <DiffArtifact issueNumber={issueNumber} revision={revision} />;
  }
}

/**
 * The full result of one stage, in a drawer. Its status is the description of the dialog.
 * Escape closes it and focus returns to where it opened.
 */
export function StageDrawer({ nodeId, detail, revision, onClose }: StageDrawerProps) {
  const t = useT();
  const node = detail.flow.nodes.find((entry) => entry.id === nodeId);
  // The drawer opens from the inspector's button, not from a Radix trigger, so it keeps the opener itself.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Sheet
      open={node !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="desk-drawer"
        closeLabel={t("desk.common.close")}
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected === true) {
            event.preventDefault();
            opener.current.focus();
          }
        }}
      >
        {node !== undefined && (
          <>
            <SheetHeader>
              <SheetTitle>{t(`desk.flow.node.${node.id}`)}</SheetTitle>
              <SheetDescription
                className={`desk-drawer__status ${toneClass(NODE_TONE[node.status])}`}
              >
                {t(nodeStatusKey(node.status))}
              </SheetDescription>
            </SheetHeader>
            <div className="desk-drawer__body">
              <StageContent node={node} detail={detail} revision={revision} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
