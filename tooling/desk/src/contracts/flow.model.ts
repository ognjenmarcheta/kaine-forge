import { z } from "zod";

import {
  agentStageRoleSchema,
  type AgentStageRole,
  type HistoryEvent,
  type IssueState
} from "./issue-state.contract";
import { PIPELINE, nodeKindSchema, type NodeKind, type Stage } from "./pipeline.contract";

/**
 * Renderer-independent flow graph of one issue. `buildFlowModel` derives it
 * only from the issue state and its history, so a UI draws the result and
 * decides nothing. It carries codes and numbers, never display text: the UI
 * owns the words (and the translation of them). Stages and edges come from
 * `PIPELINE`; this file adds the layout and the status rules.
 */

export const FLOW_NODE_IDS = [
  "ticket",
  "plan",
  "plan-gate",
  "build",
  "check",
  "review",
  "pr-review",
  "ship"
] as const;
export const flowNodeIdSchema = z.enum(FLOW_NODE_IDS);
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

const POSITIONS: Readonly<Record<FlowNodeId, { readonly x: number; readonly y: number }>> = {
  ticket: { x: column(0), y: 0 },
  plan: { x: column(1), y: 0 },
  "plan-gate": { x: column(2), y: 0 },
  build: { x: column(3), y: 0 },
  check: { x: column(4), y: -FLOW_LAYOUT.loopOffset },
  review: { x: column(4), y: FLOW_LAYOUT.loopOffset },
  "pr-review": { x: column(5), y: 0 },
  ship: { x: column(6), y: 0 }
};

interface Geometry {
  readonly handles: readonly [FlowHandle, FlowHandle];
  readonly arc: number | null;
}

const STRAIGHT: Geometry = { handles: ["r", "l"], arc: null };
const GEOMETRY: Readonly<Record<string, Geometry>> = {
  "check->review": { handles: ["bs", "tt"], arc: null },
  "plan-gate->plan": { handles: ["ts", "tt"], arc: -70 },
  "check->build": { handles: ["ts", "tt"], arc: -50 },
  "review->build": { handles: ["bs", "bt"], arc: 50 },
  "pr-review->review": { handles: ["bs", "bt"], arc: 70 },
  "pr-review->build": { handles: ["bs", "bt"], arc: 150 },
  "pr-review->plan": { handles: ["bs", "bt"], arc: 210 }
};
/** Automatic and re-plan loops show even when unused. Other loops show once the engineer used them. */
const ALWAYS_SHOWN: ReadonlySet<string> = new Set([
  "plan-gate->plan",
  "check->build",
  "review->build"
]);

// --- node table, derived from PIPELINE ------------------------------------

const NODE_STAGES: Readonly<Record<FlowNodeId, readonly Stage[]>> = {
  ticket: ["intake", "setup"],
  plan: ["plan"],
  "plan-gate": ["plan-gate"],
  build: ["build"],
  check: ["check"],
  review: ["review"],
  "pr-review": ["pr-review"],
  ship: ["ship", "shipped"]
};

const NODE_ROLES: Readonly<Record<FlowNodeId, AgentStageRole | null>> = {
  ticket: null,
  plan: "planner",
  "plan-gate": null,
  build: "builder",
  check: null,
  review: "reviewer",
  "pr-review": null,
  ship: null
};

const nodeOfStage = (stage: Stage | null | undefined): FlowNodeId | null =>
  stage === null || stage === undefined
    ? null
    : (FLOW_NODE_IDS.find((id) => NODE_STAGES[id].includes(stage)) ?? null);

const kindOfNode = (id: FlowNodeId): NodeKind => {
  const pipelineId = id === "ticket" ? "intake" : id;
  const node = PIPELINE.nodes.find((entry) => entry.id === pipelineId);
  if (node === undefined) throw new Error(`PIPELINE has no node '${pipelineId}'`);
  return node.kind;
};

interface FlowEdgeSpec {
  readonly from: FlowNodeId;
  readonly to: FlowNodeId;
  readonly loop: boolean;
  readonly counter: "check" | "review" | null;
}

/** Forward and loop edges of PIPELINE on flow nodes. Edges inside one node disappear. */
const EDGE_SPECS: readonly FlowEdgeSpec[] = (() => {
  const specs = new Map<string, FlowEdgeSpec>();
  const add = (spec: FlowEdgeSpec): void => {
    if (spec.from !== spec.to) specs.set(`${spec.from}->${spec.to}`, spec);
  };
  for (const edge of PIPELINE.forwardEdges) {
    const from = nodeOfStage(edge.from);
    const to = nodeOfStage(edge.to);
    if (from !== null && to !== null) add({ from, to, loop: false, counter: null });
  }
  for (const edge of PIPELINE.loopEdges) {
    const from = nodeOfStage(edge.from);
    const to = nodeOfStage(edge.to);
    if (from !== null && to !== null) add({ from, to, loop: true, counter: edge.counter });
  }
  return [...specs.values()];
})();

// --- history reading ------------------------------------------------------

const isIntakeStart = (event: HistoryEvent): boolean =>
  event.event === "intake-started" || event.event === "intake-restarted";

/** The history event that starts a run of `node` (or, for a gate, the arrival at it). */
const isRunStart = (node: FlowNodeId, event: HistoryEvent): boolean => {
  switch (node) {
    case "ticket":
      return event.event === "stage-started" && event.stage === "setup";
    case "plan-gate":
      return event.event === "plan-ready";
    case "pr-review":
      return event.event === "review-approved";
    case "ship":
      return (
        (event.event === "stage-started" || event.event === "ship-started") &&
        nodeOfStage(event.stage) === "ship"
      );
    default:
      return event.event === "stage-started" && nodeOfStage(event.stage) === node;
  }
};

const arrivalNode = (event: HistoryEvent): FlowNodeId | null => {
  if (isIntakeStart(event)) return "ticket";
  return FLOW_NODE_IDS.find((id) => isRunStart(id, event)) ?? null;
};

/**
 * Events that decide how a finished node reads: the last one wins, and a
 * `looped` event means the work went back.
 */
const DECISIONS: Readonly<
  Partial<Record<FlowNodeId, { readonly events: readonly string[]; readonly looped: string }>>
> = {
  check: { events: ["check-passed", "check-failed"], looped: "check-failed" },
  review: {
    events: ["review-approved", "review-changes-requested"],
    looped: "review-changes-requested"
  },
  "plan-gate": { events: ["plan-approved", "feedback"], looped: "feedback" },
  "pr-review": { events: ["feedback"], looped: "feedback" }
};

const FEEDBACK_NOTE = /^to (plan|build|review)$/;
const BLOCKING_NOTE = /(\d+) blocking/;

const firstLine = (text: string): string => (text.split("\n")[0] ?? "").replace(/:$/, "").trim();

/** Stage of the latest event that maps to a node. Used when the state itself names no node. */
const originNode = (history: readonly HistoryEvent[], before: number): FlowNodeId | null => {
  for (let index = Math.min(before, history.length) - 1; index >= 0; index -= 1) {
    const node = nodeOfStage(history[index]?.stage);
    if (node !== null) return node;
  }
  return null;
};

const currentNodeOf = (state: IssueState): FlowNodeId | null => {
  if (state.stage === "needs-you") {
    return nodeOfStage(state.resumeStage) ?? originNode(state.history, state.history.length);
  }
  if (state.stage === "cancelled") return originNode(state.history, state.history.length);
  return nodeOfStage(state.stage);
};

interface LoopStats {
  count: number;
  feedbackCount: number;
  blocking: number | null;
}

const duration = (from: string, to: number): number =>
  Math.max(0, Math.round(to - Date.parse(from)));

/**
 * Build the flow graph for one issue. `now` (epoch milliseconds) only drives
 * the clock of runs that have not ended.
 */
export const buildFlowModel = (state: IssueState, now: number): FlowModel => {
  const { history } = state;
  const current = currentNodeOf(state);
  const isStopped = state.stage === "needs-you" || state.stage === "cancelled";
  const isDriven = state.status === "running" || state.status === "queued";
  const isFailed = isStopped || state.status === "failed";

  const nodeOfIndex = (index: number): FlowNodeId | null => nodeOfStage(history[index]?.stage);

  const runStarts = (node: FlowNodeId): number[] => {
    const starts = history.flatMap((event, index) => (isRunStart(node, event) ? [index] : []));
    if (node !== "ticket" || starts.length > 0) return starts;
    return history.flatMap((event, index) => (isIntakeStart(event) ? [index] : []));
  };

  const visited = (node: FlowNodeId): boolean =>
    node === current ||
    runStarts(node).length > 0 ||
    history.some((event) => nodeOfStage(event.stage) === node);

  // Arrival order, with repeats of one node collapsed. A driven issue whose
  // start event is not written yet counts as arrived at its current node.
  const arrivals: FlowNodeId[] = [];
  for (const event of history) {
    const node = arrivalNode(event);
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
      if (state.stage === "plan-gate" || state.stage === "pr-review") return "waiting";
      if (isDriven) return "running";
      if (state.status === "waiting") return "waiting";
      return state.status === "done" ? "passed" : "idle";
    }
    if (!visited(node)) return "idle";
    const decision = DECISIONS[node];
    if (decision === undefined) return "passed";
    const last = history
      .filter(
        (event, index) =>
          (nodeOfIndex(index) === node && decision.events.includes(event.event)) ||
          isRunStart(node, event)
      )
      .at(-1);
    return last?.event === decision.looped ? "looped" : "passed";
  };

  const nodes: FlowNode[] = FLOW_NODE_IDS.map((id) => {
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
      kind: kindOfNode(id),
      role: NODE_ROLES[id],
      status,
      current: isCurrent,
      ...POSITIONS[id],
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

  const stats = new Map<string, LoopStats>();
  const statsOf = (key: string): LoopStats => {
    const existing = stats.get(key);
    if (existing !== undefined) return existing;
    const created: LoopStats = { count: 0, feedbackCount: 0, blocking: null };
    stats.set(key, created);
    return created;
  };
  const loopKeys = new Set(
    EDGE_SPECS.filter((spec) => spec.loop).map((spec) => `${spec.from}->${spec.to}`)
  );

  history.forEach((event, index) => {
    const node = nodeOfIndex(index);
    // A failure that sent the issue to `needs-you` did not loop back.
    const loopedBack = history[index + 1]?.event !== "needs-you";
    if (node === "check" && event.event === "check-failed" && loopedBack) {
      statsOf("check->build").count += 1;
    }
    if (node === "review" && event.event === "review-changes-requested" && loopedBack) {
      const entry = statsOf("review->build");
      entry.count += 1;
      const blocking = BLOCKING_NOTE.exec(event.note ?? "")?.[1];
      entry.blocking = blocking === undefined ? null : Number(blocking);
    }
    if (event.event !== "feedback") return;
    const target = FEEDBACK_NOTE.exec(event.note ?? "")?.[1];
    if (target === undefined) return;
    const origin = event.stage === "needs-you" ? originNode(history, index) : (node ?? "pr-review");
    const key = loopKeys.has(`${origin}->${target}`)
      ? `${origin}->${target}`
      : `pr-review->${target}`;
    statsOf(key).feedbackCount += 1;
  });

  // --- edges ---------------------------------------------------------------

  const edges: FlowEdge[] = [];
  for (const spec of EDGE_SPECS) {
    const id = `${spec.from}->${spec.to}`;
    const entry = stats.get(id) ?? { count: 0, feedbackCount: 0, blocking: null };
    const used = entry.count + entry.feedbackCount > 0;
    if (spec.loop && !used && !ALWAYS_SHOWN.has(id)) continue;

    const active = isDriven && activeFrom === spec.from && activeTo === spec.to;
    const traversed = spec.loop ? used : visited(spec.from) && visited(spec.to);
    const edgeState: EdgeState = active ? "active" : traversed ? "traversed" : "idle";
    const tone: EdgeTone =
      isStopped && spec.to === current && edgeState !== "idle"
        ? "bad"
        : spec.counter !== null && entry.count > 0
          ? "warn"
          : "neutral";
    const geometry = GEOMETRY[id] ?? STRAIGHT;
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
      loopKind: !spec.loop
        ? null
        : spec.counter !== null
          ? spec.counter
          : spec.from === "plan-gate"
            ? "replan"
            : "feedback",
      count: entry.count,
      feedbackCount: entry.feedbackCount,
      blocking: entry.blocking
    });
  }

  return { nodes, edges, current };
};
