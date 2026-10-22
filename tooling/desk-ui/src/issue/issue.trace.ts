import {
  arrivalNode,
  nodeOfStage,
  type AgentStageRole,
  type FlowModel,
  type FlowNodeId,
  type HistoryEvent,
  type LogEntry,
  type NodeKind,
  type NodeStatus,
  type RunRecord,
  type Stage
} from "@repo/desk/contracts";

import { eventOutcome } from "./issue.activity";

type StopStage = "needs-you" | "cancelled";

/** What a step is a run of: a flow node, or a stop where the desk waited on the engineer. */
export type StepKey = FlowNodeId | StopStage;

/** Who works in a step. A stop waits on the engineer. */
export type StepKind = NodeKind | "stop";

/** How a step ended, in the words of the flow graph. */
export type StepOutcome = Exclude<NodeStatus, "idle">;

/** One run of a stage: from the event that started it to the event that started the next. */
export interface TraceStep {
  /** The index of its first history event: stable while the history grows. */
  readonly id: string;
  readonly key: StepKey;
  /** The stage to inspect: the step's own, or for a stop the stage it stopped in. */
  readonly node: FlowNodeId | null;
  readonly kind: StepKind;
  /** The agent role whose runs belong here, or `null`. */
  readonly role: AgentStageRole | null;
  /** 1 for the first run of the key, 2 for the second, and so on. */
  readonly round: number;
  readonly at: string;
  readonly startMs: number;
  /** The start of the next step, or now for the last step of a live issue. */
  readonly endMs: number;
  readonly ongoing: boolean;
  readonly outcome: StepOutcome;
  /** Agent runs that started in this step, from `runs.jsonl`. */
  readonly runs: number;
  /** The cost the runs reported, or `null` when none reported one. */
  readonly costUsd: number | null;
}

/** Whether the issue still moves: the clock of its last step runs to now unless it ended. */
export type TraceLive = "running" | "waiting" | "ended";

export interface Trace {
  /** Oldest first. */
  readonly steps: readonly TraceStep[];
  readonly startMs: number;
  readonly endMs: number;
  /** Time in agent steps. */
  readonly agentMs: number;
  /** Time waiting on the engineer: gates and stops. */
  readonly youMs: number;
  readonly problems: number;
}

/** The agent role that works in a node. The ticket's agent is intake. */
const RUN_ROLE: Readonly<Partial<Record<FlowNodeId, AgentStageRole>>> = {
  ticket: "intake",
  plan: "planner",
  build: "builder",
  review: "reviewer"
};

const isStop = (stage: Stage): stage is StopStage => stage === "needs-you" || stage === "cancelled";
const isStopKey = (key: StepKey): key is StopStage => key === "needs-you" || key === "cancelled";

const keyOfStage = (stage: Stage): StepKey | null => (isStop(stage) ? stage : nodeOfStage(stage));

/** A stop, else the node the event starts a run of, else the node of its stage. */
const keyOfEvent = (event: HistoryEvent): StepKey | null =>
  isStop(event.stage) ? event.stage : (arrivalNode(event) ?? nodeOfStage(event.stage));

export const isProblem = (step: TraceStep): boolean =>
  step.outcome === "looped" || step.outcome === "failed";

function outcomeOf(
  kind: StepKind,
  events: readonly HistoryEvent[],
  ongoing: boolean,
  live: TraceLive
): StepOutcome {
  if (kind === "stop") return "failed";
  if (ongoing) return live === "running" && kind !== "human" ? "running" : "waiting";
  const decided = events
    .map((event) => eventOutcome(event.event))
    .filter((outcome) => outcome === "back" || outcome === "stopped" || outcome === "done");
  if (decided.includes("stopped")) return "failed";
  return decided.at(-1) === "back" ? "looped" : "passed";
}

/**
 * The history as steps, oldest first. A step starts where the flow graph sees a run start (or
 * a gate arrive), a stop, or an event of another stage; every other event joins the open step.
 * Agent runs belong to the step of their role in which they started.
 */
export function buildTrace(
  history: readonly HistoryEvent[],
  runs: readonly RunRecord[],
  flow: FlowModel,
  now: number,
  live: TraceLive
): Trace {
  const drafts: { key: StepKey; first: number; events: HistoryEvent[] }[] = [];
  history.forEach((event, index) => {
    const key = keyOfEvent(event);
    const open = drafts.at(-1);
    if (key === null || open?.key === key) {
      open?.events.push(event);
      return;
    }
    drafts.push({ key, first: index, events: [event] });
  });

  const lastAt = Date.parse(history.at(-1)?.at ?? "");
  const traceEnd = live === "ended" || Number.isNaN(lastAt) ? lastAt : Math.max(now, lastAt);
  const starts = drafts.map((draft) => Date.parse(draft.events[0]?.at ?? ""));
  const rounds = new Map<StepKey, number>();
  let previousNode: FlowNodeId | null = null;

  const steps = drafts.map((draft, index): TraceStep => {
    const startMs = starts[index] ?? Number.NaN;
    const next = starts[index + 1];
    const ongoing = next === undefined && live !== "ended";
    const own = isStopKey(draft.key) ? null : draft.key;
    const node = own ?? previousNode;
    if (own !== null) previousNode = own;
    const kind: StepKind =
      own === null ? "stop" : (flow.nodes.find((entry) => entry.id === own)?.kind ?? "script");
    const role = own === null ? null : (RUN_ROLE[own] ?? null);
    const matched =
      role === null
        ? []
        : runs.filter((run) => {
            const at = Date.parse(run.at);
            return run.role === role && at >= startMs && (next === undefined || at < next);
          });
    const costs = matched.flatMap((run) => (run.costUsd === null ? [] : [run.costUsd]));
    const round = (rounds.get(draft.key) ?? 0) + 1;
    rounds.set(draft.key, round);
    return {
      id: String(draft.first),
      key: draft.key,
      node,
      kind,
      role,
      round,
      at: draft.events[0]?.at ?? "",
      startMs,
      endMs: next ?? traceEnd,
      ongoing,
      outcome: outcomeOf(kind, draft.events, ongoing, live),
      runs: matched.length,
      costUsd: costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0)
    };
  });

  const timeIn = (kinds: readonly StepKind[]): number =>
    steps
      .filter((step) => kinds.includes(step.kind))
      .reduce((sum, step) => sum + Math.max(0, step.endMs - step.startMs), 0);
  return {
    steps,
    startMs: starts[0] ?? now,
    endMs: steps.length === 0 ? now : traceEnd,
    agentMs: timeIn(["agent"]),
    youMs: timeIn(["human", "stop"]),
    problems: steps.filter(isProblem).length
  };
}

export const TRACE_FILTERS = ["all", "problems", "agents"] as const;
export type TraceFilter = (typeof TRACE_FILTERS)[number];

export const filterSteps = (
  steps: readonly TraceStep[],
  filter: TraceFilter
): readonly TraceStep[] =>
  filter === "problems"
    ? steps.filter(isProblem)
    : filter === "agents"
      ? steps.filter((step) => step.kind === "agent")
      : steps;

/**
 * Where "Jump" goes: the failure that stopped an issue that needs you (the last problem),
 * otherwise the first problem. `null` when nothing went back or stopped.
 */
export function jumpTargetOf(steps: readonly TraceStep[], needsYou: boolean): TraceStep | null {
  const problems = steps.filter(isProblem);
  return (needsYou ? problems.at(-1) : problems[0]) ?? null;
}

/** A step opens by itself while it runs, and when it is the latest problem. */
export const opensByDefault = (step: TraceStep, steps: readonly TraceStep[]): boolean =>
  step.ongoing || steps.filter(isProblem).at(-1)?.id === step.id;

export interface TraceLine {
  readonly entry: LogEntry;
  /** The entry names no stage (written before the field existed): it was placed by its time. */
  readonly byTime: boolean;
}

export interface StepLines {
  readonly byStep: ReadonlyMap<string, readonly TraceLine[]>;
  /** Entries that fit no step: older than the history, with no stage. */
  readonly unassigned: number;
}

/** The latest step that started at or before `at`. */
const startedBy = (steps: readonly TraceStep[], at: number): TraceStep | undefined =>
  steps.filter((step) => step.startMs <= at).at(-1);

/**
 * The log lines of each step. An entry with a stage goes to the latest run of that stage that
 * started by its time (or the first run, for an entry a little early). An entry with no stage,
 * or with a stage the history has no step for, goes to the step that ran at its time.
 */
export function linesByStep(steps: readonly TraceStep[], entries: readonly LogEntry[]): StepLines {
  const byStep = new Map<string, TraceLine[]>();
  let unassigned = 0;
  for (const entry of entries) {
    const at = Date.parse(entry.at);
    const key = entry.stage === null || entry.stage === undefined ? null : keyOfStage(entry.stage);
    const runsOfKey = key === null ? [] : steps.filter((step) => step.key === key);
    const own = startedBy(runsOfKey, at) ?? runsOfKey[0];
    const step = own ?? startedBy(steps, at);
    if (step === undefined) {
      unassigned += 1;
      continue;
    }
    const lines = byStep.get(step.id) ?? [];
    lines.push({ entry, byTime: own === undefined });
    byStep.set(step.id, lines);
  }
  return { byStep, unassigned };
}
