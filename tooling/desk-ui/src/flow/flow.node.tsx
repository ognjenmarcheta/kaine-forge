import { FLOW_HANDLES } from "@repo/desk/contracts";
import { Handle, type NodeProps } from "@xyflow/react";

import { StageIcon } from "./flow.icon";
import { HANDLE_OFFSET, HANDLE_POSITION, HANDLE_TYPE, type DeskFlowNode } from "./flow.mapping";
import { nodeMetricText, nodeStatusText } from "./flow.text";
import { useLanguage, useT } from "../i18n/i18n.t";
import { OverflowTooltip, useOverflow } from "../shell/shell.overflow";
import { NODE_TONE, toneClass } from "../status/status.model";

/**
 * One stage of the pipeline: who works there, its status in words beside its color, the run
 * count with the last duration, and a one-line note whose full text is in a tooltip.
 */
export function DeskNode({ data, selected }: NodeProps<DeskFlowNode>) {
  const t = useT();
  const { language } = useLanguage();
  const { node, note } = data;
  const metric = nodeMetricText(t, node, language);
  const [noteRef, noteCut] = useOverflow<HTMLDivElement>(note?.short ?? "");
  return (
    <div
      className={`desk-node ${toneClass(NODE_TONE[node.status])}`}
      data-status={node.status}
      data-current={node.current ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
    >
      {FLOW_HANDLES.map((handle) => {
        const offset = HANDLE_OFFSET[handle];
        return (
          <Handle
            key={handle}
            id={handle}
            type={HANDLE_TYPE[handle]}
            position={HANDLE_POSITION[handle]}
            isConnectable={false}
            className="desk-handle"
            {...(offset === null ? {} : { style: { left: `${String(offset * 100)}%` } })}
          />
        );
      })}
      <div className="desk-node__head">
        <span className="desk-node__icon">
          <StageIcon kind={node.kind} />
        </span>
        <span className="desk-node__title">{t(`desk.flow.node.${node.id}`)}</span>
      </div>
      <div className="desk-node__status">
        <span className="desk-node__dot" aria-hidden="true" />
        <span>{nodeStatusText(t, node)}</span>
      </div>
      {metric !== null && <div className="desk-node__metrics">{metric}</div>}
      {note !== null && (
        <OverflowTooltip text={note.full} overflowing={noteCut || note.full !== note.short}>
          <div ref={noteRef} className="desk-node__note">
            {note.short}
          </div>
        </OverflowTooltip>
      )}
    </div>
  );
}
