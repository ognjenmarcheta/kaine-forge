import type { FlowModel, FlowNode, FlowNodeId } from "@repo/desk/contracts";
import { useMediaQuery } from "@repo/ui";
import {
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
  type EdgeTypes,
  type NodeTypes
} from "@xyflow/react";
import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { DeskEdge } from "./flow.edge";
import { fitOptions, shouldRefit, type Size } from "./flow.fit";
import { EDGE_TYPE, NODE_TYPE, toFlowElements } from "./flow.mapping";
import { DeskNode } from "./flow.node";
import { nodeStatusText } from "./flow.text";
import { useT } from "../i18n/i18n.t";

const NODE_TYPES: NodeTypes = { [NODE_TYPE]: DeskNode };
const EDGE_TYPES: EdgeTypes = { [EDGE_TYPE]: DeskEdge };

/** Fits the view on the first size and on a resize, never on a new model: the engineer's pan and zoom stay. */
function AutoFit({ model }: { readonly model: FlowModel }) {
  const { fitView } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const fitted = useRef<Size | null>(null);
  const latest = useRef(model);
  useEffect(() => {
    latest.current = model;
  });
  useEffect(() => {
    const size = { width, height };
    if (!shouldRefit(fitted.current, size)) return;
    fitted.current = size;
    void fitView(fitOptions(latest.current, width));
  }, [width, height, fitView]);
  return null;
}

/** Zoom and Fit. Fit frames the same stages as the automatic fit. */
function GraphControls({ model }: { readonly model: FlowModel }) {
  const width = useStore((state) => state.width);
  return (
    <Controls
      showInteractive={false}
      position="top-right"
      fitViewOptions={fitOptions(model, width)}
    />
  );
}

/** The flow node a key press on a node wrapper belongs to. */
const nodeOfEvent = (model: FlowModel, target: EventTarget): FlowNodeId | undefined => {
  if (!(target instanceof Element) || !target.classList.contains("react-flow__node")) {
    return undefined;
  }
  const id = target.getAttribute("data-id");
  return model.nodes.find((node) => node.id === id)?.id;
};

export interface FlowGraphProps {
  readonly model: FlowModel;
  readonly selected: FlowNodeId;
  readonly onSelect: (id: FlowNodeId) => void;
  /** The full needs-you reason, for the tooltip of the stopped node. */
  readonly needsYouReason: string | null;
}

/**
 * The pipeline as a graph. It is read-only: the nodes have fixed positions from the flow
 * model and cannot be moved or connected. A click, or Enter or Space on a focused node,
 * selects the stage. On a touch screen a drag scrolls the page instead of panning the graph.
 */
export function FlowGraph({ model, selected, onSelect, needsYouReason }: FlowGraphProps) {
  const t = useT();
  const touch = useMediaQuery("(pointer: coarse)");
  const describe = useMemo(
    () => (node: FlowNode) =>
      t("desk.flow.nodeLabel", {
        stage: t(`desk.flow.node.${node.id}`),
        status: nodeStatusText(t, node)
      }),
    [t]
  );
  const { nodes, edges } = useMemo(
    () => toFlowElements(model, describe, selected, needsYouReason),
    [model, describe, selected, needsYouReason]
  );
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const id = nodeOfEvent(model, event.target);
    if (id === undefined) return;
    event.preventDefault();
    onSelect(id);
  };
  return (
    <div
      className="desk-flow"
      role="group"
      aria-label={t("desk.flow.graphLabel")}
      data-touch={touch ? "true" : undefined}
      onKeyDown={onKeyDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        edgesFocusable={false}
        zoomOnScroll={false}
        panOnDrag={!touch}
        zoomOnPinch={!touch}
        preventScrolling={false}
        minZoom={0.25}
        maxZoom={1.5}
        onNodeClick={(_event, node) => {
          const id = model.nodes.find((entry) => entry.id === node.id)?.id;
          if (id !== undefined) onSelect(id);
        }}
        ariaLabelConfig={{
          "controls.ariaLabel": t("desk.flow.controls"),
          "controls.zoomIn.ariaLabel": t("desk.flow.zoomIn"),
          "controls.zoomOut.ariaLabel": t("desk.flow.zoomOut"),
          "controls.fitView.ariaLabel": t("desk.flow.fitView"),
          "node.a11yDescription.default": t("desk.flow.nodeHint"),
          "edge.a11yDescription.default": ""
        }}
      >
        <AutoFit model={model} />
        <GraphControls model={model} />
      </ReactFlow>
    </div>
  );
}
