import type {
  FlowModel,
  FlowNode,
  FlowNodeId,
  IssueDetail,
  NodeStatus
} from "@repo/desk/contracts";
import { Button } from "@repo/ui";
import { useId, useState } from "react";

import { useStageNames } from "../flow/flow.names";
import { agentName, flowStepOf, issueFlowOfView } from "../flow/flow.steps";
import { nodeMetricText, nodeStatusText } from "../flow/flow.text";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { agentRunsOf } from "../inspector/inspector.model";
import { formatCount, formatDuration, formatUsd } from "../shell/shell.format";

/** The glyph and the tone class of a step, so a step reads without color. */
const GLYPH: Readonly<Record<NodeStatus, { readonly glyph: string; readonly tone: string }>> = {
  idle: { glyph: "", tone: "" },
  running: { glyph: "↻", tone: "dk-run" },
  waiting: { glyph: "◷", tone: "dk-warn" },
  passed: { glyph: "✓", tone: "dk-ok" },
  looped: { glyph: "↺", tone: "dk-loop" },
  failed: { glyph: "!", tone: "dk-bad" }
};

/** Who works in a step: its agent, "You decide" at a gate, or the engine. */
function whoOf(t: Translate, detail: IssueDetail, node: FlowNode): string {
  if (node.kind === "human") return t("desk.rail.you");
  const agent = flowStepOf(issueFlowOfView(detail.flowDefinition), node.id)?.agent ?? null;
  const name = agentName(t, agent, node.role);
  return name === null ? t("desk.rail.engine") : t("desk.rail.agent", { name });
}

function StepFacts({
  node,
  detail,
  onDetails
}: {
  readonly node: FlowNode;
  readonly detail: IssueDetail;
  readonly onDetails: () => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const runs = agentRunsOf(node, detail);
  const costs = runs.flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]));
  const usage = runs.flatMap((run) => (run.usage === null ? [] : [run.usage]));
  const models = [...new Set(runs.map((run) => run.model ?? t("desk.rail.defaultModel")))];
  const tokens = usage.reduce(
    (sum, entry) => sum + entry.inputTokens + entry.cachedInputTokens + entry.outputTokens,
    0
  );
  const none = t("desk.inspector.kpi.empty");
  return (
    <div className="dk-sdet">
      <dl className="dk-kv">
        <dt>{t("desk.rail.fact.status")}</dt>
        <dd>{nodeStatusText(t, node)}</dd>
        <dt>{t("desk.rail.fact.runs")}</dt>
        <dd>{node.metrics === null ? none : formatCount(node.metrics.runs, language)}</dd>
        <dt>{t("desk.rail.fact.time")}</dt>
        <dd>
          {node.metrics === null ? none : formatDuration(node.metrics.lastDurationMs, language)}
        </dd>
        {runs.length > 0 && (
          <>
            <dt>{t("desk.rail.fact.cost")}</dt>
            <dd>
              {costs.length === 0
                ? none
                : formatUsd(
                    costs.reduce((sum, value) => sum + value, 0),
                    language
                  )}
            </dd>
            <dt>{t("desk.rail.fact.tokens")}</dt>
            <dd>{usage.length === 0 ? none : formatCount(tokens, language)}</dd>
            <dt>{t("desk.rail.fact.model")}</dt>
            <dd>{models.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="dk-row">
        <Button type="button" appearance="outline" spacing="compact" onClick={onDetails}>
          {t("desk.rail.details")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The steps of the item's frozen flow, in order: where it is now and what happened. A step
 * opens in place with its facts; "Open details" opens the full side sheet of the step.
 */
export function StepsRail({
  model,
  detail,
  graphOpen,
  onToggleGraph,
  onDetails
}: {
  readonly model: FlowModel;
  readonly detail: IssueDetail;
  readonly graphOpen: boolean;
  readonly onToggleGraph: () => void;
  readonly onDetails: (node: FlowNodeId) => void;
}) {
  const t = useT();
  const id = useId();
  const names = useStageNames();
  const { language } = useLanguage();
  const [open, setOpen] = useState<FlowNodeId | null>(null);
  return (
    <aside className="dk-rail" aria-labelledby={`${id}-title`}>
      <section className="dk-card dk-rail-card">
        <div className="dk-row dk-mb-100">
          <h2 id={`${id}-title`} className="dk-h-sec dk-grow">
            {t("desk.rail.title")}
          </h2>
          <Button type="button" appearance="ghost" spacing="compact" onClick={onToggleGraph}>
            {t(graphOpen ? "desk.rail.mapHide" : "desk.rail.mapShow")}
          </Button>
        </div>
        <p className="dk-t-xs dk-t-subtlest dk-mb-100">
          {detail.summary.readable ? detail.summary.flowName : ""}
        </p>
        <ol className="dk-steps">
          {model.nodes.map((node) => {
            const glyph = GLYPH[node.status];
            const expanded = open === node.id;
            const metric = nodeMetricText(t, node, language);
            return (
              <li key={node.id}>
                <Button
                  type="button"
                  appearance="ghost"
                  className={`dk-bare dk-step${node.current ? " dk-cur" : ""}${node.status === "idle" ? " dk-idle" : ""}`}
                  aria-expanded={expanded}
                  aria-current={node.current ? "step" : undefined}
                  onClick={() => setOpen(expanded ? null : node.id)}
                >
                  <span className={`dk-gl ${glyph.tone}`} aria-hidden="true">
                    {glyph.glyph}
                  </span>
                  <span className="dk-nm">{names.node(node.id)}</span>
                  <span className="dk-du">{metric ?? ""}</span>
                  <span className="dk-wh">
                    {t("desk.rail.who", {
                      who: whoOf(t, detail, node),
                      status: nodeStatusText(t, node)
                    })}
                  </span>
                </Button>
                {expanded && (
                  <StepFacts node={node} detail={detail} onDetails={() => onDetails(node.id)} />
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
  );
}
