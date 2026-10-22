import { describe, expect, it } from "vitest";

import {
  ACTIVE_STAGES,
  DEFAULT_LOOP_LIMITS,
  FEEDBACK_TARGETS,
  PIPELINE,
  STAGES,
  TERMINAL_STAGES,
  type FlowSnapshot,
  type Stage,
  type StageId
} from "../contracts";
import { transition as interpret, type MachineState, type Trigger } from "./pipeline.machine";
import { DEFAULT_SNAPSHOT, withLimits } from "../testing/flow.testing";

/** The machine on the built-in default flow, unless a test gives another snapshot. */
const transition = (
  state: MachineState,
  trigger: Trigger,
  snapshot: FlowSnapshot = DEFAULT_SNAPSHOT
) => interpret(state, trigger, snapshot);

const stateAt = (stage: StageId, over: Partial<MachineState> = {}): MachineState =>
  Object.freeze({
    stage,
    resumeStage: stage === "needs-you" ? "build" : null,
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
    prRounds: 0,
    ...over
  });

const accepted = (state: MachineState, trigger: Trigger) => {
  const result = transition(state, trigger);
  if (!result.ok) throw new Error(`expected '${trigger.type}' to be accepted: ${result.reason}`);
  return result;
};

const FINISHES_ON_COMPLETE: readonly Stage[] = ["intake", "setup", "plan", "build", "ship"];

/** Every trigger instance paired with the stages where it is legal. */
const LEGAL: readonly { trigger: Trigger; stages: readonly Stage[] }[] = [
  { trigger: { type: "start" }, stages: ["intake"] },
  ...ACTIVE_STAGES.flatMap((stage) =>
    (["ok", "blocked"] as const).map((outcome) => ({
      trigger: { type: "step-complete", step: stage, outcome } satisfies Trigger,
      // check and review finish through check-pass/fail and review-approve/changes,
      // so only a blocked outcome applies there.
      stages: outcome === "blocked" || FINISHES_ON_COMPLETE.includes(stage) ? [stage] : []
    }))
  ),
  { trigger: { type: "gate-approve" }, stages: ["plan-gate"] },
  {
    trigger: { type: "feedback", target: "plan" },
    stages: ["plan-gate", "pr-review", "needs-you"]
  },
  { trigger: { type: "feedback", target: "build" }, stages: ["pr-review", "needs-you"] },
  { trigger: { type: "feedback", target: "review" }, stages: ["pr-review", "needs-you"] },
  { trigger: { type: "check-result", result: "pass" }, stages: ["check"] },
  { trigger: { type: "check-result", result: "fail", fingerprint: "f" }, stages: ["check"] },
  { trigger: { type: "review-result", verdict: "approve" }, stages: ["review"] },
  { trigger: { type: "review-result", verdict: "changes" }, stages: ["review"] },
  { trigger: { type: "ship-confirm" }, stages: ["pr-review"] },
  { trigger: { type: "pr-feedback" }, stages: ["pr-open"] },
  { trigger: { type: "pr-closed", merged: true }, stages: ["pr-open"] },
  { trigger: { type: "pr-closed", merged: false }, stages: ["pr-open"] },
  { trigger: { type: "error" }, stages: [...ACTIVE_STAGES] },
  { trigger: { type: "continue" }, stages: ["needs-you"] },
  {
    trigger: { type: "cancel" },
    stages: STAGES.filter((stage) => !(TERMINAL_STAGES as readonly Stage[]).includes(stage))
  }
];

describe("pipeline machine: every stage x trigger", () => {
  const cases = LEGAL.flatMap(({ trigger, stages }) =>
    STAGES.map((stage) => ({ trigger, stage, legal: stages.includes(stage) }))
  );

  it.each(cases)("$trigger.type in $stage is legal: $legal", ({ trigger, stage, legal }) => {
    const result = transition(stateAt(stage), trigger);
    expect(result.ok).toBe(legal);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("accepts nothing in a terminal stage", () => {
    for (const stage of TERMINAL_STAGES) {
      for (const { trigger } of LEGAL) {
        expect(transition(stateAt(stage), trigger).ok).toBe(false);
      }
    }
  });

  it("keeps nextStage and state.stage in agreement and never mutates its input", () => {
    for (const { trigger, stages } of LEGAL) {
      for (const stage of stages) {
        const before = stateAt(stage);
        const result = accepted(before, trigger);
        expect(result.state.stage).toBe(result.nextStage);
        expect(before.stage).toBe(stage);
      }
    }
  });

  it("only moves along edges the PIPELINE declares", () => {
    const edges = new Set(
      [...PIPELINE.forwardEdges, ...PIPELINE.loopEdges].map((edge) => `${edge.from}>${edge.to}`)
    );
    for (const { trigger, stages } of LEGAL) {
      for (const stage of stages) {
        if (stage === "needs-you" || trigger.type === "start") continue;
        const { nextStage } = accepted(stateAt(stage), trigger);
        if (nextStage === "needs-you" || nextStage === "cancelled") continue;
        expect(edges, `${stage} -> ${nextStage} via ${trigger.type}`).toContain(
          `${stage}>${nextStage}`
        );
      }
    }
  });
});

describe("pipeline machine: forward path", () => {
  it("walks the happy path from intake to a merged PR", () => {
    const steps: readonly [Trigger, Stage][] = [
      [{ type: "start" }, "intake"],
      [{ type: "step-complete", step: "intake", outcome: "ok" }, "setup"],
      [{ type: "step-complete", step: "setup", outcome: "ok" }, "plan"],
      [{ type: "step-complete", step: "plan", outcome: "ok" }, "plan-gate"],
      [{ type: "gate-approve" }, "build"],
      [{ type: "step-complete", step: "build", outcome: "ok" }, "check"],
      [{ type: "check-result", result: "pass" }, "review"],
      [{ type: "review-result", verdict: "approve" }, "pr-review"],
      [{ type: "ship-confirm" }, "ship"],
      [{ type: "step-complete", step: "ship", outcome: "ok" }, "pr-open"],
      [{ type: "pr-closed", merged: true }, "shipped"]
    ];
    let state = stateAt("intake");
    for (const [trigger, expected] of steps) {
      state = accepted(state, trigger).state;
      expect(state.stage).toBe(expected);
    }
  });

  it("rejects a stale completion for a stage the issue already left", () => {
    const result = transition(stateAt("plan"), {
      type: "step-complete",
      step: "setup",
      outcome: "ok"
    });
    expect(result.ok).toBe(false);
  });

  it("sends a blocked stage to needs-you with that stage as resumeStage", () => {
    const result = accepted(stateAt("build"), {
      type: "step-complete",
      step: "build",
      outcome: "blocked"
    });
    expect(result).toMatchObject({ nextStage: "needs-you", reason: "blocked" });
    expect(result.state.resumeStage).toBe("build");
  });
});

describe("pipeline machine: guards", () => {
  it("asks the runner to verify the ship gate on every way into ship", () => {
    expect(accepted(stateAt("pr-review"), { type: "ship-confirm" }).guard).toBe("ship-gate");
    const resumed = accepted(stateAt("needs-you", { resumeStage: "ship" }), { type: "continue" });
    expect(resumed).toMatchObject({ nextStage: "ship", guard: "ship-gate" });
  });

  it("needs no guard elsewhere", () => {
    expect(accepted(stateAt("plan-gate"), { type: "gate-approve" }).guard).toBe("none");
    expect(accepted(stateAt("check"), { type: "check-result", result: "pass" }).guard).toBe("none");
  });
});

describe("pipeline machine: check loop", () => {
  it("loops back to build three times, then stops at the fourth failure", () => {
    let state = stateAt("check");
    for (const round of [1, 2, 3]) {
      const result = accepted(state, {
        type: "check-result",
        result: "fail",
        fingerprint: `fp-${round}`
      });
      expect(result.nextStage).toBe("build");
      expect(result.state.loops.check).toBe(round);
      state = { ...result.state, stage: "check" };
    }
    const stopped = accepted(state, { type: "check-result", result: "fail", fingerprint: "fp-4" });
    expect(stopped).toMatchObject({ nextStage: "needs-you", reason: "loop-limit" });
    expect(stopped.state.resumeStage).toBe("check");
    expect(stopped.state.loops.check).toBe(3);
  });

  it("honors custom limits", () => {
    const result = transition(
      stateAt("check", { loops: { check: 1, review: 0 } }),
      { type: "check-result", result: "fail", fingerprint: "x" },
      withLimits(DEFAULT_SNAPSHOT, { check: 1 })
    );
    expect(result).toMatchObject({ ok: true, nextStage: "needs-you", reason: "loop-limit" });
  });

  it("stops early when two consecutive failures share a fingerprint", () => {
    const first = accepted(stateAt("check"), {
      type: "check-result",
      result: "fail",
      fingerprint: "same"
    });
    expect(first.nextStage).toBe("build");
    expect(first.state.lastCheckFingerprint).toBe("same");

    const second = accepted(
      { ...first.state, stage: "check" },
      { type: "check-result", result: "fail", fingerprint: "same" }
    );
    expect(second).toMatchObject({ nextStage: "needs-you", reason: "same-failure" });
    expect(second.state.resumeStage).toBe("check");
    expect(second.state.loops.check).toBe(1);
  });

  it("keeps looping when the fingerprint changes", () => {
    const first = accepted(stateAt("check"), {
      type: "check-result",
      result: "fail",
      fingerprint: "a"
    });
    const second = accepted(
      { ...first.state, stage: "check" },
      { type: "check-result", result: "fail", fingerprint: "b" }
    );
    expect(second.nextStage).toBe("build");
    expect(second.state.loops.check).toBe(2);
  });

  it("forgets the last fingerprint once checks pass", () => {
    const passed = accepted(stateAt("check", { lastCheckFingerprint: "a" }), {
      type: "check-result",
      result: "pass"
    });
    expect(passed.nextStage).toBe("review");
    expect(passed.state.lastCheckFingerprint).toBeNull();
  });
});

describe("pipeline machine: review loop", () => {
  it("loops back to build twice, then stops at the third request", () => {
    let state = stateAt("review");
    for (const round of [1, 2]) {
      const result = accepted(state, { type: "review-result", verdict: "changes" });
      expect(result.nextStage).toBe("build");
      expect(result.state.loops.review).toBe(round);
      state = { ...result.state, stage: "review" };
    }
    const stopped = accepted(state, { type: "review-result", verdict: "changes" });
    expect(stopped).toMatchObject({ nextStage: "needs-you", reason: "loop-limit" });
    expect(stopped.state.resumeStage).toBe("review");
  });

  it("counts the check and review loops separately", () => {
    const result = accepted(stateAt("review", { loops: { check: 3, review: 0 } }), {
      type: "review-result",
      verdict: "changes"
    });
    expect(result.state.loops).toEqual({ check: 3, review: 1 });
  });
});

describe("pipeline machine: human input", () => {
  const spent = { loops: { check: 3, review: 2 }, lastCheckFingerprint: "stuck" } as const;

  it("resets the loop budget on plan approval", () => {
    const { state } = accepted(stateAt("plan-gate", spent), { type: "gate-approve" });
    expect(state).toMatchObject({
      stage: "build",
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null
    });
  });

  it.each(FEEDBACK_TARGETS)("resets the loop budget on feedback to %s", (target) => {
    const { state } = accepted(stateAt("pr-review", spent), { type: "feedback", target });
    expect(state).toMatchObject({
      stage: target,
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null
    });
  });

  it("lets plan-gate feedback reach only the plan", () => {
    expect(transition(stateAt("plan-gate"), { type: "feedback", target: "build" }).ok).toBe(false);
    expect(transition(stateAt("plan-gate"), { type: "feedback", target: "review" }).ok).toBe(false);
  });

  it("sends needs-you feedback to any target and clears resumeStage", () => {
    const { state } = accepted(stateAt("needs-you", { ...spent, resumeStage: "check" }), {
      type: "feedback",
      target: "plan"
    });
    expect(state).toMatchObject({ stage: "plan", resumeStage: null, loops: { check: 0 } });
  });
});

describe("pipeline machine: needs-you and continue", () => {
  it("records the failing stage as resumeStage on error", () => {
    for (const stage of ACTIVE_STAGES) {
      const result = accepted(stateAt(stage), { type: "error" });
      expect(result).toMatchObject({ nextStage: "needs-you", reason: "error" });
      expect(result.state.resumeStage).toBe(stage);
    }
  });

  it("keeps loop counters when an issue stops", () => {
    const result = accepted(stateAt("build", { loops: { check: 2, review: 1 } }), {
      type: "error"
    });
    expect(result.state.loops).toEqual({ check: 2, review: 1 });
  });

  it("continues from resumeStage and resets the budget", () => {
    const result = accepted(
      stateAt("needs-you", {
        resumeStage: "check",
        loops: { check: 3, review: 0 },
        lastCheckFingerprint: "a"
      }),
      { type: "continue" }
    );
    expect(result.state).toEqual({
      stage: "check",
      resumeStage: null,
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null,
      prRounds: 0
    });
  });

  it("lets the engineer pick another stage to continue from", () => {
    const result = accepted(stateAt("needs-you", { resumeStage: "check" }), {
      type: "continue",
      from: "build"
    });
    expect(result.nextStage).toBe("build");
  });

  it("refuses to continue into a decision gate, needs-you, or a terminal stage", () => {
    for (const from of ["plan-gate", "pr-review", "needs-you", "shipped", "cancelled"] as const) {
      expect(transition(stateAt("needs-you"), { type: "continue", from }).ok).toBe(false);
    }
  });

  it("refuses to continue when nothing records a stage to resume", () => {
    expect(transition(stateAt("needs-you", { resumeStage: null }), { type: "continue" }).ok).toBe(
      false
    );
  });

  it("clears resumeStage on cancel", () => {
    const result = accepted(stateAt("needs-you", { resumeStage: "check" }), { type: "cancel" });
    expect(result.state).toMatchObject({ stage: "cancelled", resumeStage: null });
  });
});

describe("pipeline machine: open PR", () => {
  const spent = { loops: { check: 3, review: 2 }, lastCheckFingerprint: "stuck" } as const;

  it("sends PR feedback to build with a fresh loop budget and one more PR round", () => {
    const result = accepted(stateAt("pr-open", { ...spent, prRounds: 1 }), {
      type: "pr-feedback"
    });
    expect(result.state).toEqual({
      stage: "build",
      resumeStage: null,
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null,
      prRounds: 2
    });
  });

  it("stops at the PR round limit and keeps pr-open to resume", () => {
    const atCap = stateAt("pr-open", { prRounds: DEFAULT_LOOP_LIMITS.prRounds });
    const result = accepted(atCap, { type: "pr-feedback" });
    expect(result).toMatchObject({ nextStage: "needs-you", reason: "pr-round-limit" });
    expect(result.state).toMatchObject({ resumeStage: "pr-open", prRounds: 3 });

    const custom = transition(
      stateAt("pr-open", { prRounds: 1 }),
      { type: "pr-feedback" },
      withLimits(DEFAULT_SNAPSHOT, {}, 1)
    );
    expect(custom).toMatchObject({ ok: true, nextStage: "needs-you", reason: "pr-round-limit" });
  });

  it("ends at shipped when the PR merged and at cancelled when it closed", () => {
    expect(accepted(stateAt("pr-open"), { type: "pr-closed", merged: true }).nextStage).toBe(
      "shipped"
    );
    expect(accepted(stateAt("pr-open"), { type: "pr-closed", merged: false }).nextStage).toBe(
      "cancelled"
    );
  });

  it("continues into pr-open from the round limit and keeps the round count", () => {
    const result = accepted(stateAt("needs-you", { resumeStage: "pr-open", prRounds: 3 }), {
      type: "continue"
    });
    expect(result.state).toMatchObject({ stage: "pr-open", prRounds: 3 });
    expect(result.guard).toBe("none");
  });

  it("never resets the PR round count on feedback", () => {
    const result = accepted(stateAt("needs-you", { resumeStage: "pr-open", prRounds: 3 }), {
      type: "feedback",
      target: "build"
    });
    expect(result.state).toMatchObject({ stage: "build", prRounds: 3 });
  });
});

describe("pipeline machine: a flow of its own", () => {
  const reportAgent = {
    id: "release-notes",
    name: "Release notes",
    description: "Writes release notes.",
    provider: "claude",
    output: "report",
    capabilities: { preset: "read-only", mcp: [], skills: [] },
    prompt: "# Release notes"
  } as const satisfies FlowSnapshot["agents"][number];

  /** The default flow with `steps` in place of its own, and the report agent beside its agents. */
  const flowOf = (steps: FlowSnapshot["flow"]["steps"]): FlowSnapshot => ({
    ...DEFAULT_SNAPSHOT,
    flow: { ...DEFAULT_SNAPSHOT.flow, steps },
    agents: [...DEFAULT_SNAPSHOT.agents, reportAgent]
  });
  const stepsOf = (...ids: string[]) =>
    DEFAULT_SNAPSHOT.flow.steps.filter((step) => ids.includes(step.id));

  it("rejects a trigger for a step the issue left, and a result the step does not produce", () => {
    const flow = flowOf([
      ...stepsOf("plan", "plan-gate", "build", "check", "review"),
      { id: "notes", kind: "agent", label: "Notes", agent: "release-notes" },
      ...stepsOf("pr-review", "ship", "pr-open")
    ]);
    const atNotes = stateAt("notes");
    expect(
      transition(atNotes, { type: "step-complete", step: "review", outcome: "ok" }, flow).ok
    ).toBe(false);
    expect(transition(atNotes, { type: "review-result", verdict: "approve" }, flow).ok).toBe(false);
    expect(transition(atNotes, { type: "check-result", result: "pass" }, flow).ok).toBe(false);
    const done = transition(atNotes, { type: "step-complete", step: "notes", outcome: "ok" }, flow);
    expect(done).toMatchObject({ ok: true, nextStage: "pr-review" });
  });

  it("enters a manual ship only on the owner's confirmation, and an automatic one by moving forward", () => {
    const manual = { id: "ship", kind: "ship", label: "Ship", auto: false } as const;
    const automatic = { ...manual, auto: true } as const;
    const pass = { type: "check-result", result: "pass" } as const;
    const intoShip = { ok: true, nextStage: "ship", guard: "ship-gate" };

    const manualAfterGate = flowOf([...stepsOf("plan", "build", "check", "pr-review"), manual]);
    expect(transition(stateAt("pr-review"), { type: "gate-approve" }, manualAfterGate).ok).toBe(
      false
    );
    expect(
      transition(stateAt("pr-review"), { type: "ship-confirm" }, manualAfterGate)
    ).toMatchObject(intoShip);

    const autoAfterCheck = flowOf([...stepsOf("plan", "build", "check"), automatic]);
    expect(transition(stateAt("check"), pass, autoAfterCheck)).toMatchObject(intoShip);
    const autoAfterGate = flowOf([...stepsOf("plan", "build", "check", "pr-review"), automatic]);
    expect(transition(stateAt("pr-review"), { type: "gate-approve" }, autoAfterGate)).toMatchObject(
      intoShip
    );
  });

  const notes = (id: string): FlowSnapshot["flow"]["steps"][number] => ({
    id,
    kind: "agent",
    label: id,
    agent: "release-notes"
  });

  it("ends a flow without a ship step at finished after its last report", () => {
    const research = flowOf([...stepsOf("plan", "plan-gate"), notes("research"), notes("summary")]);
    const walk: readonly [Trigger, StageId][] = [
      [{ type: "step-complete", step: "plan", outcome: "ok" }, "plan-gate"],
      [{ type: "gate-approve" }, "research"],
      [{ type: "step-complete", step: "research", outcome: "ok" }, "summary"],
      [{ type: "step-complete", step: "summary", outcome: "ok" }, "finished"]
    ];
    let state = stateAt("plan");
    for (const [trigger, expected] of walk) {
      const result = transition(state, trigger, research);
      if (!result.ok) throw new Error(`'${trigger.type}' was rejected: ${result.reason}`);
      expect(result).toMatchObject({ nextStage: expected, guard: "none", reason: null });
      state = result.state;
    }
    expect(state.resumeStage).toBeNull();
    expect(transition(state, { type: "cancel" }, research).ok).toBe(false);
  });

  it("ends a flow without a ship step at finished after a last gate approval or check pass", () => {
    const endsAtGate = flowOf(stepsOf("plan", "plan-gate"));
    expect(transition(stateAt("plan-gate"), { type: "gate-approve" }, endsAtGate)).toMatchObject({
      ok: true,
      nextStage: "finished"
    });
    const endsAtCheck = flowOf(stepsOf("plan", "build", "check"));
    expect(
      transition(stateAt("check"), { type: "check-result", result: "pass" }, endsAtCheck)
    ).toMatchObject({ ok: true, nextStage: "finished" });
  });

  it("still has no forward edge after the last step of a flow with a ship step", () => {
    const notesAfterShip = flowOf([
      ...stepsOf("plan", "build", "check", "pr-review", "ship"),
      notes("notes")
    ]);
    const done = { type: "step-complete", step: "notes", outcome: "ok" } as const;
    expect(transition(stateAt("notes"), done, notesAfterShip).ok).toBe(false);
  });
});
