import { FLOW_NODE_IDS, type FlowNodeId, type NodeStatus } from "@repo/desk/contracts";

import { useT, type Translate } from "../i18n/i18n.t";
import { NODE_TONE, nodeStatusKey, toneClass } from "../status/status.model";

/** "Stage 4 of 8: Build (Running)", or how many stages passed when no stage holds the issue. */
export function progressLabel(
  t: Translate,
  progress: readonly NodeStatus[],
  current: FlowNodeId | null
): string {
  const total = FLOW_NODE_IDS.length;
  const index = current === null ? -1 : FLOW_NODE_IDS.indexOf(current);
  const status = progress[index];
  if (current === null || status === undefined) {
    return t("desk.card.progressNone", {
      passed: progress.filter((entry) => entry === "passed").length,
      total
    });
  }
  return t("desk.card.progress", {
    index: index + 1,
    total,
    stage: t(`desk.flow.node.${current}`),
    status: t(nodeStatusKey(status))
  });
}

/**
 * The pipeline in eight segments, one for each flow node. The color of a segment is its
 * status; the current one is taller. The whole bar has one accessible name in words.
 */
export function StageProgress({
  progress,
  current
}: {
  readonly progress: readonly NodeStatus[];
  readonly current: FlowNodeId | null;
}) {
  const t = useT();
  return (
    <div className="desk-progress" role="img" aria-label={progressLabel(t, progress, current)}>
      {FLOW_NODE_IDS.map((id, index) => {
        const status = progress[index] ?? "idle";
        return (
          <span
            key={id}
            className={`desk-progress__segment ${toneClass(NODE_TONE[status])}`}
            data-status={status}
            data-current={id === current ? "true" : undefined}
          />
        );
      })}
    </div>
  );
}
