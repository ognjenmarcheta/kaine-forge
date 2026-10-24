import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseFlowFile } from "./registry.parse";
import {
  ACTIVE_STAGES,
  FEEDBACK_TARGETS,
  STAGES,
  type FlowDefinition,
  type FlowStep,
  type Stage
} from "../contracts";
import {
  transition as interpret,
  type MachineState,
  type Trigger
} from "../engine/pipeline.machine";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

/**
 * The engine interprets the built-in flow. Its moves between steps must be exactly the
 * ones the flow file declares.
 */
const transition = (state: MachineState, trigger: Trigger) =>
  interpret(state, trigger, DEFAULT_SNAPSHOT);

const loadDefaultFlow = async (): Promise<FlowDefinition> => {
  const text = await readFile(
    new URL("../../defaults/flows/kaine-default.yaml", import.meta.url),
    "utf8"
  );
  const parsed = parseFlowFile(text);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed.definition;
};

const at = (stage: Stage, patch: Partial<MachineState> = {}): MachineState => ({
  stage,
  resumeStage: null,
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  prRounds: 0,
  ...patch
});

const TRIGGERS: readonly Trigger[] = [
  { type: "start" },
  ...ACTIVE_STAGES.map((stage): Trigger => ({ type: "step-complete", step: stage, outcome: "ok" })),
  { type: "gate-approve" },
  ...FEEDBACK_TARGETS.map((target): Trigger => ({ type: "feedback", target })),
  { type: "check-result", result: "pass" },
  { type: "check-result", result: "fail", fingerprint: "f1" },
  { type: "review-result", verdict: "approve" },
  { type: "review-result", verdict: "changes" },
  { type: "ship-confirm" },
  { type: "pr-feedback" },
  { type: "pr-closed", merged: true },
  { type: "pr-closed", merged: false },
  { type: "error" },
  { type: "continue" },
  { type: "cancel" }
];

const stageOf = (step: FlowStep): Stage => {
  const stage = STAGES.find((entry) => entry === step.id);
  if (stage === undefined) throw new Error(`Step '${step.id}' is not an engine stage`);
  return stage;
};

/** Every move the machine makes between two flow steps, with the triggers that make it. */
const machineEdges = (flow: FlowDefinition): Map<string, string[]> => {
  const ids = new Set(flow.steps.map((step) => step.id));
  const edges = new Map<string, string[]>();
  for (const step of flow.steps) {
    for (const trigger of TRIGGERS) {
      const result = transition(at(stageOf(step)), trigger);
      if (!result.ok || !ids.has(result.nextStage)) continue;
      const key = `${step.id}->${result.nextStage}`;
      edges.set(key, [...(edges.get(key) ?? []), trigger.type]);
    }
  }
  return edges;
};

/** The moves the flow describes: forward to the next step, and every reference back. */
const flowEdges = (flow: FlowDefinition): string[] =>
  flow.steps.flatMap((step, index) => {
    const next = flow.steps[index + 1];
    const back = [
      ...(step.loopBack === undefined ? [] : [step.loopBack.to]),
      ...(step.kind === "gate" ? step.sendBack : []),
      ...(step.kind === "pr-wait" ? [step.backTo] : [])
    ];
    return [...(next === undefined ? [] : [next.id]), ...back].map((to) => `${step.id}->${to}`);
  });

describe("the built-in kaine-default flow matches the engine's transition table", () => {
  it("has exactly the machine's edges between flow steps", async () => {
    const flow = await loadDefaultFlow();
    expect([...machineEdges(flow).keys()].sort()).toEqual(flowEdges(flow).sort());
  });
});
