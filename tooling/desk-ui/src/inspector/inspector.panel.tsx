import type { FlowModel, FlowNode, FlowNodeId, IssueDetail } from "@repo/desk/contracts";
import {
  Button,
  FileText,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@repo/ui";
import { useId } from "react";

import { anomaliesOf } from "./inspector.model";
import { Anomalies } from "./inspector.parts";
import { StageSection } from "./inspector.stage";
import { StageIcon } from "../flow/flow.icon";
import { nodeStatusText } from "../flow/flow.text";
import type { IssueActions } from "../gates/gate.actions";
import { useGatePanel, type GateLayout } from "../gates/gate.panel";
import { useT, type Translate } from "../i18n/i18n.t";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { NODE_TONE, toneClass, type ReadableSummary } from "../status/status.model";

const EMPTY: readonly never[] = [];

/** Who works in the stage: "Agent · Planner", "You decide", "The engine runs it", "The GitHub issue". */
const subtitleOf = (t: Translate, node: FlowNode): string =>
  node.role === null
    ? t(`desk.inspector.subtitle.${node.kind}`)
    : t("desk.inspector.subtitle.agentRole", { role: t(`desk.inspector.role.${node.role}`) });

export interface InspectorProps {
  readonly detail: IssueDetail;
  readonly summary: ReadableSummary;
  /** The live flow model: the running stage's clock ticks with the page clock. */
  readonly flow: FlowModel;
  readonly selected: FlowNodeId;
  readonly onSelect: (id: FlowNodeId) => void;
  readonly revision: string;
  readonly actions: IssueActions;
  readonly onOpenResult: () => void;
  readonly onRemoved: () => void;
  readonly layout: GateLayout;
}

/**
 * The selected stage in detail: who works there, its status, four tiles, its checklists,
 * what went wrong, and the full result in a drawer. The decision for the issue is pinned
 * at the bottom on a desktop, whatever stage is selected. Below 64 rem only its actions
 * stick to the bottom, and the decision itself sits above the tiles while the issue waits.
 */
export function Inspector({
  detail,
  summary,
  flow,
  selected,
  onSelect,
  revision,
  actions,
  onOpenResult,
  onRemoved,
  layout
}: InspectorProps) {
  const t = useT();
  const id = useId();
  const { state } = useDesk();
  const gate = useGatePanel({ detail, summary, actions, onRemoved, layout });
  const logs = state.logs[summary.issueNumber] ?? EMPTY;
  const node = flow.nodes.find((entry) => entry.id === selected) ?? flow.nodes[0];
  if (node === undefined) return null;
  const tone = NODE_TONE[node.status];
  return (
    <aside className="desk-inspector" aria-labelledby={`${id}-title`}>
      <div className="desk-inspector__body">
        <div className="desk-inspector__top">
          <Label htmlFor={`${id}-stage`} className="desk-eyebrow">
            {t("desk.inspector.title")}
          </Label>
          <Select
            value={node.id}
            onValueChange={(value) => {
              const next = flow.nodes.find((entry) => entry.id === value);
              if (next !== undefined) onSelect(next.id);
            }}
          >
            <SelectTrigger id={`${id}-stage`} className="desk-inspector__select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {flow.nodes.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {t(`desk.flow.node.${entry.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="desk-inspector__head">
          <span className={`desk-inspector__icon ${toneClass(tone)}`}>
            <StageIcon kind={node.kind} />
          </span>
          <div className="desk-inspector__name">
            <h2 id={`${id}-title`}>{t(`desk.flow.node.${node.id}`)}</h2>
            <p className="desk-muted">{subtitleOf(t, node)}</p>
          </div>
          <StatusChip tone={tone}>{nodeStatusText(t, node)}</StatusChip>
        </div>
        {gate.placement === "first" && gate.decision}
        <StageSection key={node.id} node={node} detail={detail} flow={flow} revision={revision} />
        <Anomalies anomalies={anomaliesOf(node, detail, flow, logs)} />
        <Button appearance="subtle" className="desk-inspector__open" onClick={onOpenResult}>
          <FileText aria-hidden="true" className="desk-icon" />
          {t("desk.inspector.openResult")}
        </Button>
        {gate.placement === "last" && gate.decision}
      </div>
      {gate.placement === "pinned" && (
        <div className="desk-inspector__actions">{gate.decision}</div>
      )}
      {gate.bar}
    </aside>
  );
}
