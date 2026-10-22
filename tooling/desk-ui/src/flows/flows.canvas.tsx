import { STEP_KINDS, type StepKind } from "@repo/desk/contracts";
import { Button, TriangleAlert } from "@repo/ui";
import {
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { KindIcon, stepTitle } from "./flows.kind";
import {
  CANVAS_NODE,
  backEdgesOf,
  checkConnect,
  columnX,
  connectBack,
  moveStep,
  removeBackEdge,
  slotAt,
  type BackEdge,
  type BackKind,
  type FlowDraft,
  type StepDraft
} from "./flows.model";
import { shouldRefit, type Size } from "../flow/flow.fit";
import { arcPath } from "../flow/flow.mapping";
import { useT } from "../i18n/i18n.t";

/** The setup node: before the first step, never moved or connected. */
const SETUP = "setup";
/** The MIME type a palette item carries while it is dragged onto the canvas. */
const STEP_MIME = "application/x-desk-step";

type StepNodeData = {
  /** `null`: setup. */
  readonly step: StepDraft | null;
  readonly title: string;
  readonly kindName: string;
  readonly invalid: boolean;
  readonly editable: boolean;
} & Record<string, unknown>;
type StepNode = Node<StepNodeData, "flows-step">;

type BackEdgeData = {
  readonly edge: BackEdge;
  readonly label: string;
  /** Columns between the two ends: a longer edge bends higher. */
  readonly span: number;
} & Record<string, unknown>;
type BackFlowEdge = Edge<BackEdgeData, "flows-back">;

/** A step card with its handles: forward in and out on the sides, back edges on top. */
function StepCard({ data, selected }: NodeProps<StepNode>) {
  const t = useT();
  const { step, title, kindName, invalid, editable } = data;
  return (
    <div
      className="desk-flows-node"
      data-selected={selected ? "true" : undefined}
      data-invalid={invalid ? "true" : undefined}
      data-setup={step === null ? "true" : undefined}
    >
      {step !== null && (
        <Handle id="in" type="target" position={Position.Left} isConnectable={false} />
      )}
      <Handle id="out" type="source" position={Position.Right} isConnectable={false} />
      {step !== null && (
        <>
          <Handle
            id="back"
            type="source"
            position={Position.Top}
            isConnectable={editable}
            isConnectableEnd={false}
            className="desk-flows-handle desk-flows-handle--out"
            title={t("desk.flows.canvas.dragBack")}
          />
          <Handle
            id="back-in"
            type="target"
            position={Position.Top}
            isConnectable={editable}
            isConnectableStart={false}
            className="desk-flows-handle desk-flows-handle--in"
          />
        </>
      )}
      <div className="desk-flows-node__head">
        <span className="desk-flows-node__icon">
          <KindIcon kind={step?.kind ?? "setup"} />
        </span>
        <span className="desk-flows-node__title">{title}</span>
      </div>
      <div className="desk-flows-node__kind">{kindName}</div>
      {invalid && (
        <TriangleAlert aria-hidden="true" className="desk-icon desk-flows-node__marker" />
      )}
    </div>
  );
}

/** A back edge: an arc above the cards, with what it is. A dashed red arc names no earlier step. */
function BackArc({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected
}: EdgeProps<BackFlowEdge>) {
  if (data === undefined) return null;
  const route = arcPath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    -(28 + 12 * data.span)
  );
  const markerId = `desk-flows-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  return (
    <>
      <g
        className="desk-flows-edge"
        data-kind={data.edge.kind}
        data-invalid={data.edge.invalid ? "true" : undefined}
        data-selected={selected === true ? "true" : undefined}
      >
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
            <path d="M 0 0 L 10 5 L 0 10 z" className="desk-flows-edge__arrow" />
          </marker>
        </defs>
        <BaseEdge id={id} path={route.path} markerEnd={`url(#${markerId})`} />
      </g>
      <EdgeLabelRenderer>
        <div
          className="desk-flows-edge__label nodrag nopan"
          data-invalid={data.edge.invalid ? "true" : undefined}
          style={{
            transform: `translate(-50%, -50%) translate(${String(route.label.x)}px, ${String(route.label.y)}px)`
          }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const FIT = { padding: 0.06, maxZoom: 1, duration: 0 } as const;

/** Fits the whole flow once its cards are measured, on a resize, and when a step comes or goes. */
function AutoFit({ count }: { readonly count: number }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const fitted = useRef<{ readonly size: Size; readonly count: number } | null>(null);
  useEffect(() => {
    const size = { width, height };
    if (!ready) return;
    if (fitted.current?.count === count && !shouldRefit(fitted.current.size, size)) return;
    if (size.width <= 0 || size.height <= 0) return;
    fitted.current = { size, count };
    void fitView(FIT);
  }, [ready, width, height, count, fitView]);
  return null;
}

const NODE_TYPES: NodeTypes = { "flows-step": StepCard };
const EDGE_TYPES: EdgeTypes = { "flows-back": BackArc };

const isStepKind = (value: string): value is StepKind => STEP_KINDS.some((kind) => kind === value);

/** A pending connection from a step that can point back in more than one way. */
interface Choice {
  readonly source: string;
  readonly target: string;
  readonly choices: readonly BackKind[];
}

export interface FlowCanvasProps {
  readonly draft: FlowDraft;
  readonly editable: boolean;
  /** Steps with a problem: their node carries a marker. */
  readonly invalid: ReadonlySet<string>;
  readonly selected: string | null;
  /** A card was clicked, or Enter pressed on it: open its step in the list. */
  readonly onSelect: (key: string) => void;
  readonly onChange: (next: FlowDraft) => void;
  readonly onInsert: (kind: StepKind, at: number) => void;
}

function Canvas({
  draft,
  editable,
  invalid,
  selected,
  onSelect,
  onChange,
  onInsert
}: FlowCanvasProps) {
  const t = useT();
  const { screenToFlowPosition } = useReactFlow();
  const [drag, setDrag] = useState<{ readonly id: string; readonly x: number } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [refused, setRefused] = useState(false);

  const nodes = useMemo((): StepNode[] => {
    const setup: StepNode = {
      id: SETUP,
      type: "flows-step",
      position: { x: columnX(0), y: 0 },
      data: {
        step: null,
        title: t("desk.stage.setup"),
        kindName: t("desk.flows.kind.setup"),
        invalid: false,
        editable
      },
      width: CANVAS_NODE.width,
      height: CANVAS_NODE.height,
      ariaLabel: t("desk.flows.canvas.setupLabel"),
      draggable: false,
      connectable: false,
      selectable: false,
      deletable: false
    };
    return [
      setup,
      ...draft.steps.map((step, index): StepNode => {
        const title = stepTitle(step);
        const kindName = t(`desk.flows.kind.${step.kind}`);
        const bad = invalid.has(step.key);
        return {
          id: step.key,
          type: "flows-step",
          position: { x: drag?.id === step.key ? drag.x : columnX(index + 1), y: 0 },
          data: { step, title, kindName, invalid: bad, editable },
          width: CANVAS_NODE.width,
          height: CANVAS_NODE.height,
          ariaLabel: t(bad ? "desk.flows.canvas.nodeLabelInvalid" : "desk.flows.canvas.nodeLabel", {
            index: index + 1,
            title,
            kind: kindName
          }),
          selected: selected === step.key,
          draggable: editable,
          deletable: false
        };
      })
    ];
  }, [draft, drag, editable, invalid, selected, t]);

  const backEdges = useMemo(() => backEdgesOf(draft), [draft]);
  const edges = useMemo((): Edge[] => {
    const indexOf = new Map(draft.steps.map((step, index) => [step.key, index]));
    const chain = [SETUP, ...draft.steps.map((step) => step.key)];
    const forward = chain.slice(1).map((key, index): Edge => ({
      id: `forward:${chain[index] ?? SETUP}:${key}`,
      source: chain[index] ?? SETUP,
      target: key,
      sourceHandle: "out",
      targetHandle: "in",
      type: "straight",
      selectable: false,
      focusable: false,
      deletable: false,
      // The order is in the cards' own labels; a line between two cards says nothing more.
      domAttributes: { "aria-hidden": true }
    }));
    const back = backEdges.map((edge): BackFlowEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: "back",
      targetHandle: "back-in",
      type: "flows-back",
      data: {
        edge,
        span: Math.abs((indexOf.get(edge.source) ?? 0) - (indexOf.get(edge.target) ?? 0)),
        label:
          edge.kind === "loopBack"
            ? t("desk.flows.edge.loopBack", { limit: edge.limit ?? "" })
            : t(`desk.flows.edge.${edge.kind}`)
      },
      selected: selectedEdge === edge.id,
      selectable: editable && edge.removable,
      focusable: editable && edge.removable,
      deletable: editable && edge.removable,
      ariaLabel: t("desk.flows.canvas.edgeLabel", {
        kind: t(`desk.flows.edge.${edge.kind}Name`),
        from: stepTitle(draft.steps[indexOf.get(edge.source) ?? -1] ?? { id: "", label: "" }),
        to: stepTitle(draft.steps[indexOf.get(edge.target) ?? -1] ?? { id: "", label: "" })
      })
    }));
    return [...forward, ...back];
  }, [backEdges, draft, editable, selectedEdge, t]);

  const shownEdge = backEdges.find((edge) => edge.id === selectedEdge && edge.removable);
  const titleOf = (key: string): string =>
    stepTitle(draft.steps.find((step) => step.key === key) ?? { id: key, label: "" });

  const removeEdges = (ids: readonly string[]): void => {
    let next = draft;
    for (const edge of backEdges) if (ids.includes(edge.id)) next = removeBackEdge(next, edge);
    setSelectedEdge(null);
    if (next !== draft) onChange(next);
  };

  const connect = (connection: Connection): void => {
    const check = checkConnect(draft, connection.source, connection.target);
    if (!check.ok) {
      setRefused(true);
      return;
    }
    const [only] = check.choices;
    if (check.choices.length === 1 && only !== undefined) {
      onChange(connectBack(draft, connection.source, connection.target, only));
      return;
    }
    setChoice({ source: connection.source, target: connection.target, choices: check.choices });
  };

  const onNodesChange = (changes: NodeChange<StepNode>[]): void => {
    for (const change of changes) {
      if (change.type === "position" && change.dragging === true && change.position) {
        setDrag({ id: change.id, x: change.position.x });
      }
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    const kind = event.dataTransfer.getData(STEP_MIME);
    if (!editable || !isStepKind(kind)) return;
    event.preventDefault();
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onInsert(kind, slotAt(at.x, draft.steps.length));
  };

  /**
   * On a focused card: Enter or Space opens its step in the list, Left and Right move it. This
   * runs before React Flow's own keys, which would move the card freely on the canvas.
   */
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target;
    if (!(target instanceof Element) || !target.classList.contains("react-flow__node")) return;
    const key = target.getAttribute("data-id");
    if (key === null || key === SETUP) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(key);
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    const from = draft.steps.findIndex((step) => step.key === key);
    const by = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (editable && by !== 0 && from + by >= 0 && from + by < draft.steps.length) {
      onChange(moveStep(draft, key, from + by));
    }
  };

  return (
    <div
      className="desk-flows-canvas"
      role="group"
      aria-label={t("desk.flows.canvas.label")}
      onKeyDownCapture={onKeyDownCapture}
      onDragOver={(event) => {
        if (!editable || !event.dataTransfer.types.includes(STEP_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <ReactFlow<StepNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_event, node) => {
          setDrag(null);
          const from = draft.steps.findIndex((step) => step.key === node.id);
          if (from < 0) return;
          const to = slotAt(node.position.x + CANVAS_NODE.width / 2, draft.steps.length, from);
          if (to !== from) onChange(moveStep(draft, node.id, to));
        }}
        onNodeClick={(_event, node) => {
          if (node.id !== SETUP) onSelect(node.id);
        }}
        onEdgeClick={(_event, edge) => setSelectedEdge(edge.selectable === true ? edge.id : null)}
        onPaneClick={() => {
          setSelectedEdge(null);
          setChoice(null);
        }}
        onDelete={({ edges: removed }) => removeEdges(removed.map((edge) => edge.id))}
        onConnectStart={() => {
          setRefused(false);
          setChoice(null);
        }}
        onConnect={connect}
        onConnectEnd={(_event, state) => {
          if (state.isValid === false && state.toNode !== null) setRefused(true);
        }}
        isValidConnection={(connection) =>
          checkConnect(draft, connection.source, connection.target).ok
        }
        nodesDraggable={editable}
        nodesConnectable={editable}
        nodesFocusable
        edgesFocusable={editable}
        elementsSelectable
        deleteKeyCode={editable ? ["Delete", "Backspace"] : null}
        connectionRadius={48}
        nodeDragThreshold={4}
        zoomOnScroll={false}
        preventScrolling={false}
        fitView
        fitViewOptions={FIT}
        minZoom={0.3}
        maxZoom={1.5}
        ariaLabelConfig={{
          "controls.ariaLabel": t("desk.flow.controls"),
          "controls.zoomIn.ariaLabel": t("desk.flow.zoomIn"),
          "controls.zoomOut.ariaLabel": t("desk.flow.zoomOut"),
          "controls.fitView.ariaLabel": t("desk.flow.fitView"),
          "node.a11yDescription.default": t("desk.flows.canvas.nodeHint"),
          "node.a11yDescription.keyboardDisabled": t("desk.flows.canvas.nodeHint"),
          "edge.a11yDescription.default": t("desk.flows.canvas.edgeHint")
        }}
      >
        <AutoFit count={draft.steps.length} />
        <Controls showInteractive={false} position="top-right" fitViewOptions={FIT} />
        {refused && (
          <Panel position="bottom-left" className="desk-flows-panel desk-flows-panel--refused">
            <p role="status">{t("desk.flows.canvas.refused")}</p>
          </Panel>
        )}
        {choice !== null && (
          <Panel position="top-left" className="desk-flows-panel">
            <p id="desk-flows-choice">
              {t("desk.flows.canvas.choose", {
                from: titleOf(choice.source),
                to: titleOf(choice.target)
              })}
            </p>
            <div
              className="desk-flows-panel__actions"
              role="group"
              aria-labelledby="desk-flows-choice"
            >
              {choice.choices.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  spacing="compact"
                  onClick={() => {
                    onChange(connectBack(draft, choice.source, choice.target, kind));
                    setChoice(null);
                  }}
                >
                  {t(`desk.flows.edge.${kind}Name`)}
                </Button>
              ))}
              <Button
                type="button"
                appearance="subtle"
                spacing="compact"
                onClick={() => setChoice(null)}
              >
                {t("desk.common.cancel")}
              </Button>
            </div>
          </Panel>
        )}
        {shownEdge !== undefined && editable && (
          <Panel position="bottom-right" className="desk-flows-panel">
            <p>
              {t("desk.flows.canvas.edgeLabel", {
                kind: t(`desk.flows.edge.${shownEdge.kind}Name`),
                from: titleOf(shownEdge.source),
                to: titleOf(shownEdge.target)
              })}
            </p>
            <Button
              type="button"
              appearance="danger"
              spacing="compact"
              onClick={() => removeEdges([shownEdge.id])}
            >
              {t("desk.flows.canvas.removeEdge")}
            </Button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

/** Step kinds to drag onto the canvas. A press adds the kind after the selected step. */
function StepPalette({
  draft,
  selected,
  onInsert
}: Pick<FlowCanvasProps, "draft" | "selected" | "onInsert">) {
  const t = useT();
  const after = draft.steps.findIndex((step) => step.key === selected);
  const at = after < 0 ? draft.steps.length : after + 1;
  return (
    <div className="desk-flows-palette" role="group" aria-labelledby="desk-flows-palette-title">
      <p id="desk-flows-palette-title" className="desk-muted">
        {t("desk.flows.canvas.palette")}
      </p>
      <ul className="desk-flows-palette__list">
        {STEP_KINDS.map((kind) => (
          <li key={kind}>
            <Button
              type="button"
              appearance="subtle"
              spacing="compact"
              draggable
              className="desk-flows-palette__item"
              aria-label={t("desk.flows.canvas.paletteAdd", {
                kind: t(`desk.flows.kind.${kind}`)
              })}
              onDragStart={(event) => {
                event.dataTransfer.setData(STEP_MIME, kind);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onInsert(kind, at)}
            >
              <KindIcon kind={kind} />
              {t(`desk.flows.kind.${kind}`)}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The flow as a graph, over the same draft as the list. Drag a card sideways to move its step;
 * drag from the dot on top of a card to an earlier card to point it back (a loop back, or a
 * gate's send-back or a PR wait's feedback target when it can be either); select a back edge
 * and press Delete, or its Remove button, to remove it; drag a kind from the palette onto the
 * canvas to add a step there. An edge to a later step is refused. Every one of these edits is
 * also in the list, which stays the accessible way to make them.
 */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      {props.editable && (
        <StepPalette draft={props.draft} selected={props.selected} onInsert={props.onInsert} />
      )}
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
