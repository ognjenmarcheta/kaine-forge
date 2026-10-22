import { z } from "zod";

import { definitionIdSchema, type AgentOutputKind } from "./agent-definition.contract";
import type { FlowStep } from "./flow-definition.contract";
import { nextStepOf, outputOf, type FlowSnapshot } from "./flow-snapshot.contract";
import {
  agentStageRoleSchema,
  type AgentStageRole,
  type HistoryEvent,
  type IssueState
} from "./issue-state.contract";
import { nodeKindSchema, type NodeKind } from "./pipeline.contract";

/**
 * Renderer-independent flow graph of one issue. `buildFlowModel` derives it
 * only from the issue state, its flow snapshot and its history, so a UI draws the
 * result and decides nothing. It carries codes and numbers, never display text: the
 * UI owns the words (and the translation of them). Nodes are `ticket` and the steps of
 * the snapshot; edges are the forward order and every loop-back the steps declare.
 */

/** The node ids of the built-in default flow, in order. Its fixed layout uses them. */
export const FLOW_NODE_IDS = [
  "ticket",
  "plan",
  "plan-gate",
  "build",
  "check",
  "review",
  "pr-review",
  "ship",
  "pr-open"
] as const;
/** `ticket` (intake and setup), or a step id of the issue's flow. */
export const flowNodeIdSchema = definitionIdSchema;
export type FlowNodeId = z.infer<typeof flowNodeIdSchema>;

export const NODE_STATUSES = ["idle", "running", "waiting", "passed", "looped", "failed"] as const;
export const nodeStatusSchema = z.enum(NODE_STATUSES);
export type NodeStatus = z.infer<typeof nodeStatusSchema>;

export const EDGE_STATES = ["idle", "traversed", "active"] as const;
export const edgeStateSchema = z.enum(EDGE_STATES);
export type EdgeState = z.infer<typeof edgeStateSchema>;

export const EDGE_TONES = ["neutral", "warn", "bad"] as const;
export const edgeToneSchema = z.enum(EDGE_TONES);
export type EdgeTone = z.infer<typeof edgeToneSchema>;

/** Connection points on a node: left, right, and top or bottom for a source or a target. */
export const FLOW_HANDLES = ["l", "r", "ts", "tt", "bs", "bt"] as const;
export const flowHandleSchema = z.enum(FLOW_HANDLES);
export type FlowHandle = z.infer<typeof flowHandleSchema>;

/** What a loop-back means: a re-plan, an automatic loop, or engineer feedback. */
export const LOOP_KINDS = ["replan", "check", "review", "feedback"] as const;
export const loopKindSchema = z.enum(LOOP_KINDS);
export type LoopKind = z.infer<typeof loopKindSchema>;

export const flowNodeSchema = z
  .object({
    id: flowNodeIdSchema,
    kind: nodeKindSchema,
    /** The agent role that works here, or `null`. */
    role: agentStageRoleSchema.nullable(),
    status: nodeStatusSchema,
    /** True for the node that holds the issue now. */
    current: z.boolean(),
    x: z.number(),
    y: z.number(),
    metrics: z
      .object({
        runs: z.number().int().positive(),
        lastDurationMs: z.number().int().nonnegative(),
        /** The last run has not ended: the clock runs to `now`. */
        ongoing: z.boolean()
      })
      .strict()
      .nullable(),
    /** The latest history event, while the engine drives this node. */
    activity: z
      .object({ event: z.string(), note: z.string().nullable(), at: z.string() })
      .strict()
      .nullable(),
    /** Why the node stopped. `text` is the first line of the engine's reason. */
    badge: z
      .object({ kind: z.enum(["needs-you", "cancelled"]), text: z.string().nullable() })
      .strict()
      .nullable()
  })
  .strict();
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: flowNodeIdSchema,
    to: flowNodeIdSchema,
    state: edgeStateSchema,
    tone: edgeToneSchema,
    /** Loop-backs are drawn dashed, as an arc. */
    dashed: z.boolean(),
    sourceHandle: flowHandleSchema,
    targetHandle: flowHandleSchema,
    /** Bend of the arc in layout units, or `null` for a straight edge. */
    arc: z.number().nullable(),
    loopKind: loopKindSchema.nullable(),
    /** Automatic loop-backs (failed check, requested changes). */
    count: z.number().int().nonnegative(),
    /** Loop-backs the engineer started with feedback. */
    feedbackCount: z.number().int().nonnegative(),
    /** Blocking findings of the latest review loop, when known. */
    blocking: z.number().int().nonnegative().nullable()
  })
  .strict();
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowModelSchema = z
  .object({
    nodes: z.array(flowNodeSchema),
    edges: z.array(flowEdgeSchema),
    current: flowNodeIdSchema.nullable()
  })
  .strict();
export type FlowModel = z.infer<typeof flowModelSchema>;

// --- layout ---------------------------------------------------------------

export const FLOW_LAYOUT = { gap: 270, loopOffset: 120 } as const;

const column = (index: number): number => FLOW_LAYOUT.gap * index;

interface Position {
  readonly x: number;
  readonly y: number;
}

/** The hand-made layout of the built-in default flow. */
const DEFAULT_POSITIONS: Readonly<Record<string, Position>> = {
  ticket: { x: column(0), y: 0 },
  plan: { x: column(1), y: 0 },
  "plan-gate": { x: column(2), y: 0 },
  build: { x: column(3), y: 0 },
  check: { x: column(4), y: -FLOW_LAYOUT.loopOffset },
  review: { x: column(4), y: FLOW_LAYOUT.loopOffset },
  "pr-review": { x: column(5), y: 0 },
  ship: { x: column(6), y: 0 },
  // Below ship in its column, so the whole pipeline keeps its width.
  "pr-open": { x: column(6), y: FLOW_LAYOUT.loopOffset }
};

interface Geometry {
  readonly handles: readonly [FlowHandle, FlowHandle];
  readonly arc: number | null;
}

const STRAIGHT: Geometry = { handles: ["r", "l"], arc: null };
/** Down from a node to the one below it in the same column. */
const DOWN: Geometry = { handles: ["bs", "tt"], arc: null };
const DEFAULT_GEOMETRY: Readonly<Record<string, Geometry>> = {
  "check->review": DOWN,
  "ship->pr-open": DOWN,
  "plan-gate->plan": { handles: ["ts", "tt"], arc: -70 },
  "check->build": { handles: ["ts", "tt"], arc: -50 },
  "review->build": { handles: ["bs", "bt"], arc: 50 },
  "pr-review->review": { handles: ["bs", "bt"], arc: 70 },
  "pr-review->build": { handles: ["bs", "bt"], arc: 150 },
  "pr-review->plan": { handles: ["bs", "bt"], arc: 210 }
};

/** The default layout holds when the flow has exactly the default steps, in order. */
const usesDefaultLayout = (snapshot: FlowSnapshot): boolean => {
  const ids = ["ticket", ...snapshot.flow.steps.map((step) => step.id)];
  return (
    ids.length === FLOW_NODE_IDS.length && ids.every((id, index) => id === FLOW_NODE_IDS[index])
  );
};

/**
 * A row of columns in flow order. The pr-wait step sits below the ship step, as in the
 * default layout. Automatic loops arc above the row, the owner's loops below it, bending
 * more the further back they reach.
 */
const linearLayout = (
  snapshot: FlowSnapshot
): { readonly positions: Map<string, Position>; readonly columns: Map<string, number> } => {
  const positions = new Map<string, Position>([["ticket", { x: column(0), y: 0 }]]);
  const columns = new Map<string, number>([["ticket", 0]]);
  let index = 0;
  snapshot.flow.steps.forEach((step, at) => {
    const under = step.kind === "pr-wait" && snapshot.flow.steps[at - 1]?.kind === "ship";
    if (!under) index += 1;
    positions.set(step.id, { x: column(index), y: under ? FLOW_LAYOUT.loopOffset : 0 });
    columns.set(step.id, index);
  });
  return { positions, columns };
};

// --- node table, derived from the snapshot --------------------------------

/** The run role an agent node shows, by what its agent produces. A report agent has none. */
const NODE_ROLE: Readonly<Partial<Record<AgentOutputKind, AgentStageRole>>> = {
  plan: "planner",
  change: "builder",
  review: "reviewer"
};

const KIND_OF_STEP: Readonly<Record<FlowStep["kind"], NodeKind>> = {
  agent: "agent",
  gate: "human",
  check: "script",
  ship: "script",
  "pr-wait": "human"
};

interface NodeSpec {
  readonly id: FlowNodeId;
  readonly step: FlowStep | null;
  readonly kind: NodeKind;
  readonly role: AgentStageRole | null;
  /** The stages that place the issue on this node. */
  readonly stages: readonly string[];
}

const nodeSpecs = (snapshot: FlowSnapshot): NodeSpec[] => [
  { id: "ticket", step: null, kind: "source", role: null, stages: ["intake", "setup"] },
  ...snapshot.flow.steps.map((step): NodeSpec => {
    const output = outputOf(snapshot, step);
    return {
      id: step.id,
      step,
      kind: KIND_OF_STEP[step.kind],
      role: output === null ? null : (NODE_ROLE[output] ?? null),
      // `shipped`: the desk saw the PR merged, so the PR node reads as done.
      stages: step.kind === "pr-wait" ? [step.id, "shipped"] : [step.id]
    };
  })
];

interface FlowEdgeSpec {
  readonly from: FlowNodeId;
  readonly to: FlowNodeId;
  readonly loop: boolean;
  /** The step whose loop counter this loop-back increments. Human-driven loops have none. */
  readonly counter: string | null;
  readonly loopKind: LoopKind | null;
  /** Shown even when unused: automatic loops and the re-plan. */
  readonly always: boolean;
}

/** Forward edges in flow order, then every loop-back the steps declare. */
const edgeSpecs = (snapshot: FlowSnapshot): FlowEdgeSpec[] => {
  const { steps } = snapshot.flow;
  const forward = ["ticket", ...steps.map((step) => step.id)]
    .slice(0, -1)
    .map((from, index): FlowEdgeSpec => {
      const to = steps[index]?.id ?? from;
      return { from, to, loop: false, counter: null, loopKind: null, always: true };
    });
  const loops = steps.flatMap((step, index): FlowEdgeSpec[] => {
    const specs: FlowEdgeSpec[] = [];
    if (step.loopBack !== undefined) {
      specs.push({
        from: step.id,
        to: step.loopBack.to,
        loop: true,
        counter: step.id,
        loopKind: step.kind === "check" ? "check" : "review",
        always: true
      });
    }
    if (step.kind === "gate") {
      const previous = steps[index - 1];
      for (const target of step.sendBack) {
        // Feedback at the gate right after the plan sends the plan back: a re-plan.
        const replan = previous?.id === target && outputOf(snapshot, previous) === "plan";
        specs.push({
          from: step.id,
          to: target,
          loop: true,
          counter: null,
          loopKind: replan ? "replan" : "feedback",
          always: replan
        });
      }
    }
    if (step.kind === "pr-wait") {
      specs.push({
        from: step.id,
        to: step.backTo,
        loop: true,
        counter: null,
        loopKind: "feedback",
        always: false
      });
    }
    return specs;
  });
  return [...forward, ...loops].filter((spec) => spec.from !== spec.to);
};

// --- history reading ------------------------------------------------------

const isIntakeStart = (event: HistoryEvent): boolean =>
  event.event === "intake-started" || event.event === "intake-restarted";

/** Events that end a step and move the issue on to the next one. */
export const FORWARD_EVENTS: ReadonlySet<string> = new Set([
  "plan-ready",
  "build-complete",
  "check-passed",
  "review-approved",
  "report-ready",
  "plan-approved",
  "gate-approved"
]);

/** Events that decide how a finished node reads: the last one wins. */
interface Decision {
  readonly events: readonly string[];
  /** This event means the work went back. */
  readonly looped: string;
}

const decisionOf = (snapshot: FlowSnapshot, step: FlowStep | null): Decision | null => {
  if (step === null) return null;
  if (step.kind === "check")
    return { events: ["check-passed", "check-failed"], looped: "check-failed" };
  if (step.kind === "gate") {
    return { events: ["plan-approved", "gate-approved", "feedback"], looped: "feedback" };
  }
  if (step.kind === "pr-wait") return { events: ["pr-feedback"], looped: "pr-feedback" };
  if (outputOf(snapshot, step) === "review") {
    return {
      events: ["review-approved", "review-changes-requested"],
      looped: "review-changes-requested"
    };
  }
  return null;
};

const FEEDBACK_NOTE = /^to ([a-z0-9][a-z0-9-]*)$/;
const BLOCKING_NOTE = /^(\d+) blocking/;

const firstLine = (text: string): string => (text.split("\n")[0] ?? "").replace(/:$/, "").trim();

interface LoopStats {
  count: number;
  feedbackCount: number;
  blocking: number | null;
}

const duration = (from: string, to: number): number =>
  Math.max(0, Math.round(to - Date.parse(from)));

/** The node of a stage, or `null` for a stop (`needs-you`, `cancelled`). */
export const nodeOfStage = (
  snapshot: FlowSnapshot,
  stage: string | null | undefined
): FlowNodeId | null =>
  stage === null || stage === undefined
    ? null
    : (nodeSpecs(snapshot).find((spec) => spec.stages.includes(stage))?.id ?? null);

/** The history event that starts a run of `node` (or, for a gate, the arrival at it). */
const isRunStart = (snapshot: FlowSnapshot, node: FlowNodeId, event: HistoryEvent): boolean => {
  if (node === "ticket") return event.event === "stage-started" && event.stage === "setup";
  const step = snapshot.flow.steps.find((entry) => entry.id === node);
  if (step?.kind === "gate") {
    return FORWARD_EVENTS.has(event.event) && nextStepOf(snapshot, event.stage)?.id === step.id;
  }
  // The first ship opens the PR. The ship of a PR feedback round updates it.
  if (step?.kind === "pr-wait") return event.event === "pr-opened" || event.event === "pr-updated";
  if (step?.kind === "ship") {
    return (
      (event.event === "stage-started" || event.event === "ship-started") &&
      nodeOfStage(snapshot, event.stage) === node
    );
  }
  return event.event === "stage-started" && nodeOfStage(snapshot, event.stage) === node;
};

/** The node a history event starts a run of (or, for a gate, arrives at), or `null`. */
export const arrivalNode = (snapshot: FlowSnapshot, event: HistoryEvent): FlowNodeId | null => {
  if (isIntakeStart(event)) return "ticket";
  return nodeSpecs(snapshot).find((spec) => isRunStart(snapshot, spec.id, event))?.id ?? null;
};

/**
 * Build the flow graph for one issue. `now` (epoch milliseconds) only drives
 * the clock of runs that have not ended.
 */
export const buildFlowModel = (state: IssueState, now: number): FlowModel => {
  const { history, flowSnapshot: snapshot } = state;
  const specs = nodeSpecs(snapshot);
  const specOf = new Map(specs.map((spec) => [spec.id, spec]));
  const nodeOf = (stage: string | null | undefined): FlowNodeId | null =>
    nodeOfStage(snapshot, stage);
  const stepOfNode = (node: FlowNodeId): FlowStep | null => specOf.get(node)?.step ?? null;
  const isRunStartOf = (node: FlowNodeId, event: HistoryEvent): boolean =>
    isRunStart(snapshot, node, event);

  /** Node of the latest event that maps to a node. Used when the state itself names no node. */
  const originNode = (before: number): FlowNodeId | null => {
    for (let index = Math.min(before, history.length) - 1; index >= 0; index -= 1) {
      const node = nodeOf(history[index]?.stage);
      if (node !== null) return node;
    }
    return null;
  };

  const current: FlowNodeId | null =
    state.stage === "needs-you"
      ? (nodeOf(state.resumeStage) ?? originNode(history.length))
      : state.stage === "cancelled"
        ? originNode(history.length)
        : nodeOf(state.stage);
  const isStopped = state.stage === "needs-you" || state.stage === "cancelled";
  const isDriven = state.status === "running" || state.status === "queued";
  const isFailed = isStopped || state.status === "failed";
  const currentKind = stepOfNode(state.stage)?.kind;
  const atOwner = currentKind === "gate" || currentKind === "pr-wait";

  const nodeOfIndex = (index: number): FlowNodeId | null => nodeOf(history[index]?.stage);

  const runStarts = (node: FlowNodeId): number[] => {
    const starts = history.flatMap((event, index) => (isRunStartOf(node, event) ? [index] : []));
    if (node !== "ticket" || starts.length > 0) return starts;
    return history.flatMap((event, index) => (isIntakeStart(event) ? [index] : []));
  };

  const visited = (node: FlowNodeId): boolean =>
    node === current ||
    runStarts(node).length > 0 ||
    history.some((event) => nodeOf(event.stage) === node);

  // Arrival order, with repeats of one node collapsed. A driven issue whose
  // start event is not written yet counts as arrived at its current node.
  const arrivals: FlowNodeId[] = [];
  for (const event of history) {
    const node = arrivalNode(snapshot, event);
    if (node !== null && arrivals.at(-1) !== node) arrivals.push(node);
  }
  if (isDriven && current !== null && arrivals.at(-1) !== current) arrivals.push(current);
  const activeFrom = arrivals.length >= 2 && isDriven ? arrivals.at(-2) : undefined;
  const activeTo = arrivals.at(-1);

  const stoppedNote = isStopped
    ? [...history].reverse().find((event) => event.stage === "needs-you")?.note
    : undefined;

  const statusOf = (node: FlowNodeId): NodeStatus => {
    if (node === current) {
      if (isFailed) return "failed";
      if (atOwner) return "waiting";
      if (isDriven) return "running";
      if (state.status === "waiting") return "waiting";
      return state.status === "done" ? "passed" : "idle";
    }
    if (!visited(node)) return "idle";
    const decision = decisionOf(snapshot, stepOfNode(node));
    if (decision === null) return "passed";
    const last = history
      .filter(
        (event, index) =>
          (nodeOfIndex(index) === node && decision.events.includes(event.event)) ||
          isRunStartOf(node, event)
      )
      .at(-1);
    return last?.event === decision.looped ? "looped" : "passed";
  };

  const layout = usesDefaultLayout(snapshot) ? null : linearLayout(snapshot);
  const positionOf = (id: FlowNodeId): Position =>
    (layout === null ? DEFAULT_POSITIONS[id] : layout.positions.get(id)) ?? { x: 0, y: 0 };

  const nodes: FlowNode[] = specs.map((spec) => {
    const { id } = spec;
    const isCurrent = id === current;
    const status = statusOf(id);
    const starts = runStarts(id);
    const lastStart = starts.at(-1);
    let metrics: FlowNode["metrics"] = null;
    if (lastStart !== undefined) {
      const started = history[lastStart];
      const next = history[lastStart + 1];
      const ongoing = isCurrent && (status === "running" || status === "waiting");
      const end = ongoing
        ? now
        : next === undefined
          ? Date.parse(state.updatedAt)
          : Date.parse(next.at);
      metrics = {
        runs: starts.length,
        lastDurationMs: started === undefined ? 0 : duration(started.at, end),
        ongoing
      };
    }
    const latest = history.at(-1);
    return {
      id,
      kind: spec.kind,
      role: spec.role,
      status,
      current: isCurrent,
      ...positionOf(id),
      metrics,
      activity:
        isCurrent && isDriven && latest !== undefined
          ? { event: latest.event, note: latest.note ?? null, at: latest.at }
          : null,
      badge: !isCurrent
        ? null
        : state.stage === "cancelled"
          ? { kind: "cancelled", text: null }
          : state.stage === "needs-you"
            ? { kind: "needs-you", text: stoppedNote === undefined ? null : firstLine(stoppedNote) }
            : null
    };
  });

  // --- loop counts ---------------------------------------------------------

  const edgesOut = edgeSpecs(snapshot);
  const stats = new Map<string, LoopStats>();
  const statsOf = (key: string): LoopStats => {
    const existing = stats.get(key);
    if (existing !== undefined) return existing;
    const created: LoopStats = { count: 0, feedbackCount: 0, blocking: null };
    stats.set(key, created);
    return created;
  };
  const loopKeys = new Set(
    edgesOut.filter((spec) => spec.loop).map((spec) => `${spec.from}->${spec.to}`)
  );
  /** Where feedback given outside a gate is drawn: the last gate that sends back there. */
  const feedbackGate = (target: string): FlowNodeId | null =>
    [...snapshot.flow.steps]
      .reverse()
      .find((step) => step.kind === "gate" && step.sendBack.includes(target))?.id ?? null;

  history.forEach((event, index) => {
    const node = nodeOfIndex(index);
    const step = node === null ? null : stepOfNode(node);
    // A failure that sent the issue to `needs-you` did not loop back.
    const loopedBack = history[index + 1]?.event !== "needs-you";
    if (step?.loopBack !== undefined && loopedBack) {
      const key = `${step.id}->${step.loopBack.to}`;
      if (step.kind === "check" && event.event === "check-failed") statsOf(key).count += 1;
      if (event.event === "review-changes-requested") {
        const entry = statsOf(key);
        entry.count += 1;
        const blocking = BLOCKING_NOTE.exec(event.note ?? "")?.[1];
        entry.blocking = blocking === undefined ? null : Number(blocking);
      }
    }
    // PR feedback always goes from the open PR back to its `backTo` step.
    if (event.event === "pr-feedback" && step?.kind === "pr-wait") {
      statsOf(`${step.id}->${step.backTo}`).feedbackCount += 1;
    }
    if (event.event !== "feedback") return;
    const target = FEEDBACK_NOTE.exec(event.note ?? "")?.[1];
    if (target === undefined) return;
    const origin = event.stage === "needs-you" ? originNode(index) : node;
    const key =
      origin !== null && loopKeys.has(`${origin}->${target}`)
        ? `${origin}->${target}`
        : `${feedbackGate(target) ?? "ticket"}->${target}`;
    statsOf(key).feedbackCount += 1;
  });

  // --- edges ---------------------------------------------------------------

  /** Generic arcs: automatic loops above the row, the owner's loops below, wider with reach. */
  const geometryOf = (spec: FlowEdgeSpec, id: string): Geometry => {
    if (layout === null) return DEFAULT_GEOMETRY[id] ?? STRAIGHT;
    const from = layout.columns.get(spec.from) ?? 0;
    const to = layout.columns.get(spec.to) ?? 0;
    if (!spec.loop) return from === to ? DOWN : STRAIGHT;
    const reach = 50 + 40 * Math.max(0, from - to - 1);
    return spec.counter !== null || spec.loopKind === "replan"
      ? { handles: ["ts", "tt"], arc: -reach }
      : { handles: ["bs", "bt"], arc: reach };
  };

  const edges: FlowEdge[] = [];
  for (const spec of edgesOut) {
    const id = `${spec.from}->${spec.to}`;
    const entry = stats.get(id) ?? { count: 0, feedbackCount: 0, blocking: null };
    const used = entry.count + entry.feedbackCount > 0;
    if (spec.loop && !used && !spec.always) continue;

    const active = isDriven && activeFrom === spec.from && activeTo === spec.to;
    const traversed = spec.loop ? used : visited(spec.from) && visited(spec.to);
    const edgeState: EdgeState = active ? "active" : traversed ? "traversed" : "idle";
    const tone: EdgeTone =
      isStopped && spec.to === current && edgeState !== "idle"
        ? "bad"
        : spec.counter !== null && entry.count > 0
          ? "warn"
          : "neutral";
    const geometry = geometryOf(spec, id);
    const [sourceHandle, targetHandle] = geometry.handles;
    edges.push({
      id,
      from: spec.from,
      to: spec.to,
      state: edgeState,
      tone,
      dashed: spec.loop,
      sourceHandle,
      targetHandle,
      arc: geometry.arc,
      loopKind: spec.loopKind,
      count: entry.count,
      feedbackCount: entry.feedbackCount,
      blocking: entry.blocking
    });
  }

  return { nodes, edges, current };
};
