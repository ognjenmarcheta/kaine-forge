import {
  FLOW_LAYOUT,
  type FlowEdge,
  type FlowHandle,
  type FlowModel,
  type FlowNode,
  type LoopKind
} from "@repo/desk/contracts";
import { Position, type Edge, type Node } from "@xyflow/react";

import { firstLine } from "../shell/shell.format";
import { reasonExcerpt } from "../status/status.model";

/** Size of a node card on the canvas. `.desk-node` in the stylesheet has the same size. */
export const NODE_SIZE = { width: 120, height: 96 } as const;

/**
 * The model's layout units, scaled to the canvas. Columns sit close, with room for an arrow,
 * so the whole pipeline fits the main column of a 1440 px desktop at full size: the node text
 * renders at its token size. Rows and arcs scale vertically too, so loops keep their shape.
 */
export const CANVAS_SCALE = {
  x: (NODE_SIZE.width + 12) / FLOW_LAYOUT.gap,
  y: (NODE_SIZE.height + 24) / FLOW_LAYOUT.loopOffset,
  /** Columns sit closer, so loops bend higher: their count labels stay clear of the nodes. */
  arc: (1.6 * (NODE_SIZE.height + 24)) / FLOW_LAYOUT.loopOffset
} as const;

/** The short note of a node and the full text behind it (shown in a tooltip). */
export interface NodeNote {
  readonly short: string;
  readonly full: string;
}

/**
 * What a node says under its status: why it stopped, or what the engine does there now. A
 * stop shows the reason's first sentence; the full reason stays one hover away.
 */
export function nodeNote(node: FlowNode, needsYouReason: string | null): NodeNote | null {
  if (node.badge?.kind === "needs-you") {
    const full = needsYouReason ?? node.badge.text ?? "";
    return full.trim() === "" ? null : { short: reasonExcerpt(full), full: full.trim() };
  }
  const text = node.badge?.text ?? node.activity?.note ?? null;
  return text === null || text.trim() === "" ? null : { short: firstLine(text), full: text.trim() };
}

export type DeskNodeData = { readonly node: FlowNode; readonly note: NodeNote | null } & Record<
  string,
  unknown
>;
export type DeskEdgeData = { readonly edge: FlowEdge } & Record<string, unknown>;
export type DeskFlowNode = Node<DeskNodeData, "desk-node">;
export type DeskFlowEdge = Edge<DeskEdgeData, "desk-edge">;

export const NODE_TYPE = "desk-node";
export const EDGE_TYPE = "desk-edge";

/** Where each connection point sits on a node card. */
export const HANDLE_POSITION: Readonly<Record<FlowHandle, Position>> = {
  l: Position.Left,
  r: Position.Right,
  ts: Position.Top,
  tt: Position.Top,
  bs: Position.Bottom,
  bt: Position.Bottom
};

/** Source handles carry `s` or `r`, target handles `t` or `l`. Top and bottom share a side, so they sit at different offsets. */
export const HANDLE_OFFSET: Readonly<Record<FlowHandle, number | null>> = {
  l: null,
  r: null,
  ts: 0.35,
  tt: 0.65,
  bs: 0.35,
  bt: 0.65
};

export const HANDLE_TYPE: Readonly<Record<FlowHandle, "source" | "target">> = {
  l: "target",
  r: "source",
  ts: "source",
  tt: "target",
  bs: "source",
  bt: "target"
};

/** The model, as React Flow props. Positions are the model's, scaled: the graph is not laid out again and cannot be dragged. */
export function toFlowElements(
  model: FlowModel,
  describe: (node: FlowNode) => string,
  selectedId: string | null,
  needsYouReason: string | null = null
): {
  readonly nodes: DeskFlowNode[];
  readonly edges: DeskFlowEdge[];
} {
  return {
    nodes: model.nodes.map((node): DeskFlowNode => ({
      id: node.id,
      type: NODE_TYPE,
      position: { x: node.x * CANVAS_SCALE.x, y: node.y * CANVAS_SCALE.y },
      data: { node, note: nodeNote(node, needsYouReason) },
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
      ariaLabel: describe(node),
      selected: node.id === selectedId,
      draggable: false,
      connectable: false,
      selectable: true,
      focusable: true
    })),
    edges: model.edges.map((edge): DeskFlowEdge => ({
      id: edge.id,
      type: EDGE_TYPE,
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      data: { edge },
      selectable: false,
      focusable: false
    }))
  };
}

export interface LabelPart {
  readonly kind: LoopKind;
  readonly count: number;
  /** The count is the engineer's feedback, not an automatic loop. */
  readonly feedback: boolean;
}

/** What a loop edge says: automatic loops ("2 review loops") and the engineer's feedback. */
export function edgeLabelParts(edge: FlowEdge): LabelPart[] {
  const parts: LabelPart[] = [];
  if (edge.loopKind !== null && edge.count > 0) {
    parts.push({ kind: edge.loopKind, count: edge.count, feedback: false });
  }
  if (edge.loopKind !== null && edge.feedbackCount > 0) {
    parts.push({ kind: edge.loopKind, count: edge.feedbackCount, feedback: true });
  }
  return parts;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A bent path for a loop edge. `arc` is the bend in layout units: negative
 * bends up, positive bends down. Both control points move the same way, and a
 * cubic curve reaches three quarters of that offset, so the offset is scaled
 * to make the peak equal `arc`. Returns the path and the label point (the
 * middle of the curve).
 */
export function arcPath(
  source: Point,
  target: Point,
  arc: number
): { readonly path: string; readonly label: Point } {
  const lift = (arc * 4) / 3;
  const c1: Point = { x: source.x, y: source.y + lift };
  const c2: Point = { x: target.x, y: target.y + lift };
  const label: Point = {
    x: (source.x + 3 * c1.x + 3 * c2.x + target.x) / 8,
    y: (source.y + 3 * c1.y + 3 * c2.y + target.y) / 8
  };
  return {
    path: `M ${String(source.x)} ${String(source.y)} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(c2.y)}, ${String(target.x)} ${String(target.y)}`,
    label
  };
}
