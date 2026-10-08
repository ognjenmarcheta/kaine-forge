import type { FlowNode } from "@repo/desk/contracts";

import type { Translate } from "../i18n/i18n.t";
import { formatDuration } from "../shell/shell.format";
import { nodeStatusKey } from "../status/status.model";

/** The status of a node in words. A stop says why: it needs you, or it was cancelled. */
export const nodeStatusText = (t: Translate, node: FlowNode): string => {
  if (node.badge?.kind === "cancelled") return t("desk.flow.badge.cancelled");
  if (node.badge?.kind === "needs-you") return t("desk.flow.badge.needs-you");
  return t(nodeStatusKey(node.status));
};

/** "2× · 1m 1s": the run count and the last (or running) duration, or `null` before the first run. */
export const nodeMetricText = (t: Translate, node: FlowNode, language: string): string | null =>
  node.metrics === null
    ? null
    : t("desk.flow.metrics", {
        runs: node.metrics.runs,
        duration: formatDuration(node.metrics.lastDurationMs, language)
      });
