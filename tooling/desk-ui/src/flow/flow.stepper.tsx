import type { FlowModel, FlowNode, FlowNodeId } from "@repo/desk/contracts";
import { Button } from "@repo/ui";

import { StageIcon } from "./flow.icon";
import { nodeNote } from "./flow.mapping";
import { nodeMetricText, nodeStatusText } from "./flow.text";
import { useLanguage, useT } from "../i18n/i18n.t";
import { OverflowTooltip, useOverflow } from "../shell/shell.overflow";
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
  readonly selected: FlowNodeId;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly needsYouReason: string | null;
}

function Step({
  node,
  selected,
  onSelect,
  needsYouReason
}: {
  readonly node: FlowNode;
  readonly selected: boolean;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly needsYouReason: string | null;
}) {
  const t = useT();
  const { language } = useLanguage();
  const metric = nodeMetricText(t, node, language);
  const note = nodeNote(node, needsYouReason);
  const [noteRef, noteCut] = useOverflow<HTMLSpanElement>(note?.short ?? "");
  return (
    <li
      className={`desk-stepper__item ${toneClass(NODE_TONE[node.status])}`}
      data-status={node.status}
    >
      <Button
        appearance="ghost"
        className="desk-stepper__button"
        aria-current={node.current ? "step" : undefined}
        aria-pressed={selected}
        onClick={() => onSelect(node.id)}
      >
        <span className="desk-stepper__icon" data-current={node.current ? "true" : undefined}>
          <StageIcon kind={node.kind} />
        </span>
        <span className="desk-stepper__body">
          <span className="desk-stepper__title">{t(`desk.flow.node.${node.id}`)}</span>{" "}
          <span className="desk-stepper__status">
            <span className="desk-node__dot" aria-hidden="true" />
            {nodeStatusText(t, node)}
          </span>{" "}
          {metric !== null && <span className="desk-stepper__meta">{metric}</span>}{" "}
          {note !== null && (
            <OverflowTooltip text={note.full} overflowing={noteCut}>
              <span ref={noteRef} className="desk-stepper__note">
                {note.short}
              </span>
            </OverflowTooltip>
          )}
        </span>
      </Button>
    </li>
  );
}

/**
 * The pipeline as a vertical list of stages. It replaces the graph on a narrow screen and is
 * a keyboard path to every stage: each step is a button that selects its stage.
 */
export function FlowStepper({ model, selected, onSelect, needsYouReason }: FlowStepperProps) {
  const t = useT();
  return (
    <ol className="desk-stepper" aria-label={t("desk.flow.listLabel")}>
      {model.nodes.map((node) => (
        <Step
          key={node.id}
          node={node}
          selected={node.id === selected}
          onSelect={onSelect}
          needsYouReason={needsYouReason}
        />
      ))}
    </ol>
  );
}

/** The stages in words for a screen reader, beside the graph on a wide screen. */
export function FlowStagesText({
  model,
  needsYouReason
}: {
  readonly model: FlowModel;
  readonly needsYouReason: string | null;
}) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <ol className="desk-stages-text" aria-label={t("desk.flow.listLabel")}>
      {model.nodes.map((node) => {
        const parts = [
          t("desk.flow.nodeLabel", {
            stage: t(`desk.flow.node.${node.id}`),
            status: nodeStatusText(t, node)
          }),
          nodeMetricText(t, node, language),
          nodeNote(node, needsYouReason)?.short ?? null
        ].filter((part) => part !== null);
        return (
          <li key={node.id} aria-current={node.current ? "step" : undefined}>
            {parts.join(". ")}
          </li>
        );
      })}
    </ol>
  );
}
