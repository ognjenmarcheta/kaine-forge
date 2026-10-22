import { issueFlowOf, nodeIdsOf, nodeName } from "../flow/flow.steps";
import { useT, type Translate } from "../i18n/i18n.t";
import { NODE_TONE, nodeStatusKey, toneClass, type ReadableSummary } from "../status/status.model";

/**
 * "Stage 4 of 9: Build (Running)", or how many stages passed when no stage holds the issue. The
 * count is the issue's own flow: the ticket and each of its steps.
 */
export function progressLabel(t: Translate, summary: ReadableSummary): string {
  const { progress, currentNode: current } = summary;
  const flow = issueFlowOf(summary);
  const total = progress.length;
  const index = current === null ? -1 : nodeIdsOf(flow).indexOf(current);
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
    stage: nodeName(t, flow, current),
    status: t(nodeStatusKey(status))
  });
}

/**
 * The flow in segments, one for each node of the issue's flow. The color of a segment is its
 * status; the current one is taller. The whole bar has one accessible name in words.
 */
export function StageProgress({ summary }: { readonly summary: ReadableSummary }) {
  const t = useT();
  const ids = nodeIdsOf(issueFlowOf(summary));
  return (
    <div className="desk-progress" role="img" aria-label={progressLabel(t, summary)}>
      {summary.progress.map((status, index) => {
        const id = ids[index] ?? String(index);
        return (
          <span
            key={id}
            className={`desk-progress__segment ${toneClass(NODE_TONE[status])}`}
            data-status={status}
            data-current={id === summary.currentNode ? "true" : undefined}
          />
        );
      })}
    </div>
  );
}
