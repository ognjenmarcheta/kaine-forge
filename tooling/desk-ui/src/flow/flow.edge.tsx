import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

import {
  CANVAS_SCALE,
  arcPath,
  edgeLabelParts,
  type DeskFlowEdge,
  type LabelPart
} from "./flow.mapping";
import { EDGE_TONE_TONE, edgeClasses } from "./flow.status";
import { useT } from "../i18n/i18n.t";
import { toneClass } from "../status/status.model";

const labelKey = (part: LabelPart): string => {
  if (part.feedback) return "desk.flow.loop.feedback";
  return part.kind === "check" ? "desk.flow.loop.check" : "desk.flow.loop.review";
};

/**
 * A forward edge is a curve between two handles. A loop-back is dashed and bent by
 * the model's `arc` (scaled like the rows), with its loop counts as a label. An active edge moves, unless
 * the person asks for less motion (the stylesheet turns it off).
 */
export function DeskEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps<DeskFlowEdge>) {
  const t = useT();
  if (data === undefined) return null;
  const { edge } = data;
  const route =
    edge.arc === null
      ? (() => {
          const [path, x, y] = getBezierPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition
          });
          return { path, label: { x, y } };
        })()
      : arcPath(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          edge.arc * CANVAS_SCALE.arc
        );
  const parts = edgeLabelParts(edge);
  const markerId = `desk-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <>
      <g className={edgeClasses(edge.state, edge.tone, edge.dashed)}>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="desk-edge__arrow" />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={route.path}
          markerEnd={`url(#${markerId})`}
          interactionWidth={0}
          className="desk-edge__path"
        />
      </g>
      {parts.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className={`desk-edge__label ${toneClass(EDGE_TONE_TONE[edge.tone])} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${String(route.label.x)}px, ${String(route.label.y)}px)`
            }}
          >
            {parts.map((part) => (
              <span key={`${part.kind}-${String(part.feedback)}`}>
                {t(labelKey(part), { count: part.count })}
              </span>
            ))}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
