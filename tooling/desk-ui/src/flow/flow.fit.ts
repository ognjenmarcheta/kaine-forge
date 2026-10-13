import { FLOW_LAYOUT, type FlowModel, type FlowNodeId } from "@repo/desk/contracts";
import type { FitViewOptions } from "@xyflow/react";

import { CANVAS_SCALE, NODE_SIZE } from "./flow.mapping";

/** Zoom below which node text is too small to read. The graph then frames the stages around the current one. */
export const READABLE_ZOOM = 0.78;
/** How many columns on each side of the current stage stay in view. */
const NEIGHBOURS = 2;
/** Below this width the graph frames one stage on each side, so the nodes stay legible. */
const NARROW_WIDTH = 600;

/** Room on each side of the fitted stages: enough for the focus ring of the first and last node. */
export const FIT_PADDING = "8px";

/** The width of the whole pipeline on the canvas, from the first column to the end of the last node. */
export const pipelineWidth = (model: FlowModel): number => {
  const xs = model.nodes.map((node) => node.x);
  return (Math.max(...xs) - Math.min(...xs)) * CANVAS_SCALE.x + NODE_SIZE.width;
};

/** The whole pipeline when it fits at a readable size, else the stages near the current one. */
export function framedNodes(
  model: FlowModel,
  containerWidth: number
): { readonly id: FlowNodeId }[] | undefined {
  const total = pipelineWidth(model);
  const current = model.nodes.find((node) => node.id === model.current);
  if (current === undefined || containerWidth <= 0 || containerWidth / total >= READABLE_ZOOM) {
    return undefined;
  }
  const reach = containerWidth < NARROW_WIDTH ? 1 : NEIGHBOURS;
  return model.nodes
    .filter((node) => Math.abs(node.x - current.x) <= reach * FLOW_LAYOUT.gap)
    .map((node) => ({ id: node.id }));
}

/** The options of every fit: the automatic one and the Fit button. */
export const fitOptions = (model: FlowModel, containerWidth: number): FitViewOptions => {
  const nodes = framedNodes(model, containerWidth);
  return {
    ...(nodes === undefined ? {} : { nodes }),
    padding: FIT_PADDING,
    minZoom: 0.4,
    maxZoom: 1,
    duration: 0
  };
};

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The graph fits itself once it has a size, and again when that size changes. A new model
 * (an event, the clock) never moves the view, so the engineer's pan and zoom stay.
 */
export const shouldRefit = (fitted: Size | null, next: Size): boolean =>
  next.width > 0 &&
  next.height > 0 &&
  (fitted === null || fitted.width !== next.width || fitted.height !== next.height);
