import { describe, expect, it } from "vitest";

import {
  ACTIVE_STAGES,
  FEEDBACK_TARGETS,
  PIPELINE,
  STAGES,
  TERMINAL_STAGES,
  type Stage
} from "../contracts";
import { transition, type MachineState, type Trigger } from "./pipeline.machine";

const stateAt = (stage: Stage, over: Partial<MachineState> = {}): MachineState =>
  Object.freeze({
    stage,
    resumeStage: stage === "needs-you" ? "build" : null,
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
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
      trigger: { type: "stage-complete", stage, outcome } satisfies Trigger,
      // check and review finish through check-pass/fail and review-approve/changes,
      // so only a blocked outcome applies there.
      stages: outcome === "blocked" || FINISHES_ON_COMPLETE.includes(stage) ? [stage] : []
    }))
  ),
  { trigger: { type: "approve-plan" }, stages: ["plan-gate"] },
  {
    trigger: { type: "feedback", target: "plan" },
    stages: ["plan-gate", "pr-review", "needs-you"]
  },
  { trigger: { type: "feedback", target: "build" }, stages: ["pr-review", "needs-you"] },
  { trigger: { type: "feedback", target: "review" }, stages: ["pr-review", "needs-you"] },
  { trigger: { type: "check-pass" }, stages: ["check"] },
  { trigger: { type: "check-fail", fingerprint: "f" }, stages: ["check"] },
  { trigger: { type: "review-approve" }, stages: ["review"] },
  { trigger: { type: "review-changes" }, stages: ["review"] },
  { trigger: { type: "ship-confirm" }, stages: ["pr-review"] },
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
  it("walks the happy path from intake to shipped", () => {
    const steps: readonly [Trigger, Stage][] = [
      [{ type: "start" }, "intake"],
      [{ type: "stage-complete", stage: "intake", outcome: "ok" }, "setup"],
      [{ type: "stage-complete", stage: "setup", outcome: "ok" }, "plan"],
      [{ type: "stage-complete", stage: "plan", outcome: "ok" }, "plan-gate"],
      [{ type: "approve-plan" }, "build"],
      [{ type: "stage-complete", stage: "build", outcome: "ok" }, "check"],
      [{ type: "check-pass" }, "review"],
      [{ type: "review-approve" }, "pr-review"],
      [{ type: "ship-confirm" }, "ship"],
      [{ type: "stage-complete", stage: "ship", outcome: "ok" }, "shipped"]
    ];
    let state = stateAt("intake");
    for (const [trigger, expected] of steps) {
      state = accepted(state, trigger).state;
      expect(state.stage).toBe(expected);
    }
  });

  it("rejects a stale completion for a stage the issue already left", () => {
    const result = transition(stateAt("plan"), {
      type: "stage-complete",
      stage: "setup",
      outcome: "ok"
    });
    expect(result.ok).toBe(false);
  });

  it("sends a blocked stage to needs-you with that stage as resumeStage", () => {
    const result = accepted(stateAt("build"), {
      type: "stage-complete",
      stage: "build",
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
    expect(accepted(stateAt("plan-gate"), { type: "approve-plan" }).guard).toBe("none");
    expect(accepted(stateAt("check"), { type: "check-pass" }).guard).toBe("none");
  });
});

describe("pipeline machine: check loop", () => {
  it("loops back to build three times, then stops at the fourth failure", () => {
    let state = stateAt("check");
    for (const round of [1, 2, 3]) {
      const result = accepted(state, { type: "check-fail", fingerprint: `fp-${round}` });
      expect(result.nextStage).toBe("build");
      expect(result.state.loops.check).toBe(round);
      state = { ...result.state, stage: "check" };
    }
    const stopped = accepted(state, { type: "check-fail", fingerprint: "fp-4" });
    expect(stopped).toMatchObject({ nextStage: "needs-you", reason: "loop-limit" });
    expect(stopped.state.resumeStage).toBe("check");
    expect(stopped.state.loops.check).toBe(3);
  });

  it("honors custom limits", () => {
    const result = transition(
      stateAt("check", { loops: { check: 1, review: 0 } }),
      { type: "check-fail", fingerprint: "x" },
      { check: 1, review: 2 }
    );
    expect(result).toMatchObject({ ok: true, nextStage: "needs-you", reason: "loop-limit" });
  });

  it("stops early when two consecutive failures share a fingerprint", () => {
    const first = accepted(stateAt("check"), { type: "check-fail", fingerprint: "same" });
    expect(first.nextStage).toBe("build");
    expect(first.state.lastCheckFingerprint).toBe("same");

    const second = accepted(
      { ...first.state, stage: "check" },
      { type: "check-fail", fingerprint: "same" }
    );
    expect(second).toMatchObject({ nextStage: "needs-you", reason: "same-failure" });
    expect(second.state.resumeStage).toBe("check");
    expect(second.state.loops.check).toBe(1);
  });

  it("keeps looping when the fingerprint changes", () => {
    const first = accepted(stateAt("check"), { type: "check-fail", fingerprint: "a" });
    const second = accepted(
      { ...first.state, stage: "check" },
      { type: "check-fail", fingerprint: "b" }
    );
    expect(second.nextStage).toBe("build");
    expect(second.state.loops.check).toBe(2);
  });

  it("forgets the last fingerprint once checks pass", () => {
    const passed = accepted(stateAt("check", { lastCheckFingerprint: "a" }), {
      type: "check-pass"
    });
    expect(passed.nextStage).toBe("review");
    expect(passed.state.lastCheckFingerprint).toBeNull();
  });
});

describe("pipeline machine: review loop", () => {
  it("loops back to build twice, then stops at the third request", () => {
    let state = stateAt("review");
    for (const round of [1, 2]) {
      const result = accepted(state, { type: "review-changes" });
      expect(result.nextStage).toBe("build");
      expect(result.state.loops.review).toBe(round);
      state = { ...result.state, stage: "review" };
    }
    const stopped = accepted(state, { type: "review-changes" });
    expect(stopped).toMatchObject({ nextStage: "needs-you", reason: "loop-limit" });
    expect(stopped.state.resumeStage).toBe("review");
  });

  it("counts the check and review loops separately", () => {
    const result = accepted(stateAt("review", { loops: { check: 3, review: 0 } }), {
      type: "review-changes"
    });
    expect(result.state.loops).toEqual({ check: 3, review: 1 });
  });
});

describe("pipeline machine: human input", () => {
  const spent = { loops: { check: 3, review: 2 }, lastCheckFingerprint: "stuck" } as const;

  it("resets the loop budget on plan approval", () => {
    const { state } = accepted(stateAt("plan-gate", spent), { type: "approve-plan" });
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
      lastCheckFingerprint: null
    });
  });

  it("lets the engineer pick another stage to continue from", () => {
    const result = accepted(stateAt("needs-you", { resumeStage: "check" }), {
      type: "continue",
      from: "build"
    });
    expect(result.nextStage).toBe("build");
  });

  it("refuses to continue into a gate, needs-you, or a terminal stage", () => {
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
