import type { FlowModel, FlowNodeId } from "@repo/desk/contracts";
import { Button } from "@repo/ui";

import { nodeNote } from "./flow.mapping";
import { useStageNames } from "./flow.names";
import { nodeMetricText, nodeStatusText } from "./flow.text";
import { useLanguage, useT } from "../i18n/i18n.t";
import { NODE_TONE, toneClass } from "../status/status.model";

const LEGEND = ["passed", "running", "waiting", "looped", "failed"] as const;

/** What each color of the graph means. Every entry is a dot and a word. */
export function FlowLegend() {
  const t = useT();
  return (
    <ul className="desk-legend" aria-label={t("desk.flow.legend")}>
      {LEGEND.map((status) => (
        <li key={status} className={`desk-legend__item ${toneClass(NODE_TONE[status])}`}>
          <span className="desk-legend__dot" aria-hidden="true" />
          {t(`desk.flow.status.${status}`)}
        </li>
      ))}
    </ul>
  );
}

export interface FlowStepperProps {
  readonly model: FlowModel;
  /** The stage open in the side sheet, or `null`. */
  readonly selected: FlowNodeId | null;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly needsYouReason: string | null;
}

/**
 * The pipeline as one compact row of stages under the issue header: a dot and a name for each,
 * joined by a line. Each step is a button that selects its stage; its status is in its name, and
 * the metric and the note are one hover away. The row scrolls by itself on a narrow screen.
 */
export function FlowStepper({ model, selected, onSelect, needsYouReason }: FlowStepperProps) {
  const t = useT();
  const names = useStageNames();
  const { language } = useLanguage();
  return (
    <ol className="desk-stepper" aria-label={t("desk.flow.listLabel")}>
      {model.nodes.map((node) => {
        const status = nodeStatusText(t, node);
        const hover = [
          t("desk.flow.nodeLabel", { stage: names.node(node.id), status }),
          nodeMetricText(t, node, language),
          nodeNote(node, needsYouReason)?.full ?? null
        ].filter((part) => part !== null);
        return (
          <li
            key={node.id}
            className={`desk-stepper__item ${toneClass(NODE_TONE[node.status])}`}
            data-status={node.status}
          >
            <Button
              appearance="ghost"
              className="desk-stepper__button"
              aria-current={node.current ? "step" : undefined}
              aria-pressed={node.id === selected}
              title={hover.join(". ")}
              onClick={() => onSelect(node.id)}
            >
              <span className="desk-stepper__dot" aria-hidden="true" />
              <span className="desk-stepper__name">{names.node(node.id)}</span>{" "}
              <span className="desk-sr-only">{status}</span>
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
