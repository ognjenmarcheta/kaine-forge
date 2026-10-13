import { describe, expect, it } from "vitest";

import {
  FLOW_NODE_IDS,
  buildFlowModel,
  flowModelSchema,
  type FlowEdge,
  type FlowModel,
  type FlowNode,
  type FlowNodeId,
  type NodeStatus
} from "./flow.model";
import type { HistoryEvent, IssueState } from "./issue-state.contract";
import { PIPELINE, type Stage } from "./pipeline.contract";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const STEP_MS = 10_000;

type Step = readonly [stage: Stage, event: string, note?: string];

const history = (steps: readonly Step[]): HistoryEvent[] =>
  steps.map(([stage, event, note], index) => ({
    at: new Date(T0 + index * STEP_MS).toISOString(),
    stage,
    event,
    ...(note === undefined ? {} : { note })
  }));

interface Scenario {
  readonly stage: Stage;
  readonly status: IssueState["status"];
  readonly resumeStage?: Stage;
  readonly steps: readonly Step[];
}

const issue = (scenario: Scenario): IssueState => {
  const events = history(scenario.steps);
  const last = events.at(-1)?.at ?? new Date(T0).toISOString();
  return {
    schemaVersion: 1,
    issueNumber: 7,
    stage: scenario.stage,
    status: scenario.status,
    resumeStage: scenario.resumeStage ?? null,
    branch: null,
    worktreePath: null,
    sessions: {},
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
    history: events,
    authorization: null,
    createdAt: new Date(T0).toISOString(),
    updatedAt: last
  };
};

// --- history segments -----------------------------------------------------

const INTAKE: Step[] = [
  ["intake", "intake-started"],
  ["setup", "intake-complete", "contract 6/6"]
];
const SETUP: Step[] = [
  ["setup", "stage-started"],
  ["setup", "setup-complete"]
];
const PLAN: Step[] = [
  ["plan", "stage-started"],
  ["plan", "plan-ready", "2 file(s)"]
];
const APPROVE: Step[] = [["plan-gate", "plan-approved"]];
const BUILD: Step[] = [
  ["build", "stage-started"],
  ["build", "build-complete"]
];
const CHECK_PASS: Step[] = [
  ["check", "stage-started"],
  ["check", "check-passed"]
];
const CHECK_FAIL: Step[] = [
  ["check", "stage-started"],
  ["check", "check-failed", "fingerprint abc"]
];
const REVIEW_OK: Step[] = [
  ["review", "stage-started"],
  ["review", "review-approved", "1 non-blocking finding(s)"]
];
const REVIEW_CHANGES: Step[] = [
  ["review", "stage-started"],
  ["review", "review-changes-requested", "2 blocking finding(s)"]
];

const TO_PLAN_GATE: Step[] = [...INTAKE, ...SETUP, ...PLAN];
const TO_BUILD: Step[] = [...TO_PLAN_GATE, ...APPROVE];
const TO_REVIEW: Step[] = [...TO_BUILD, ...BUILD, ...CHECK_PASS];
const TO_PR_REVIEW: Step[] = [...TO_REVIEW, ...REVIEW_OK];

// --- helpers --------------------------------------------------------------

const node = (model: FlowModel, id: FlowNodeId): FlowNode => {
  const found = model.nodes.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
};
const edge = (model: FlowModel, id: string): FlowEdge => {
  const found = model.edges.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no edge ${id}`);
  return found;
};
const statuses = (model: FlowModel): Record<string, NodeStatus> =>
  Object.fromEntries(model.nodes.map((entry) => [entry.id, entry.status]));

const AFTER_LAST = T0 + 10 * 60_000;
const model = (scenario: Scenario, now = AFTER_LAST): FlowModel =>
  buildFlowModel(issue(scenario), now);

describe("buildFlowModel structure", () => {
  const fresh = model({
    stage: "intake",
    status: "running",
    steps: [["intake", "intake-started"]]
  });

  it("has one node per flow id with the kind from PIPELINE", () => {
    expect(fresh.nodes.map((entry) => entry.id)).toEqual([...FLOW_NODE_IDS]);
    const kinds = new Map(PIPELINE.nodes.map((entry) => [entry.id, entry.kind]));
    for (const entry of fresh.nodes) {
      expect(entry.kind).toBe(kinds.get(entry.id === "ticket" ? "intake" : entry.id));
    }
  });

  it("derives the forward edges from PIPELINE and drops edges inside one node", () => {
    const forward = fresh.edges.filter((entry) => !entry.dashed).map((entry) => entry.id);
    expect(forward).toEqual([
      "ticket->plan",
      "plan->plan-gate",
      "plan-gate->build",
      "build->check",
      "check->review",
      "review->pr-review",
      "pr-review->ship"
    ]);
  });

  it("shows the automatic and re-plan loops even when unused, and no feedback loop", () => {
    expect(fresh.edges.filter((entry) => entry.dashed).map((entry) => entry.id)).toEqual([
      "plan-gate->plan",
      "check->build",
      "review->build"
    ]);
  });

  it("uses fixed layout positions: check above and review below the same column", () => {
    expect(node(fresh, "check").x).toBe(node(fresh, "review").x);
    expect(node(fresh, "check").y).toBeLessThan(0);
    expect(node(fresh, "review").y).toBeGreaterThan(0);
    const xs = ["ticket", "plan", "plan-gate", "build", "check", "pr-review", "ship"].map(
      (id) => node(fresh, id as FlowNodeId).x
    );
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("marks the agent nodes with their role", () => {
    expect(fresh.nodes.filter((entry) => entry.role !== null).map((entry) => entry.role)).toEqual([
      "planner",
      "builder",
      "reviewer"
    ]);
  });
});

describe("buildFlowModel statuses", () => {
  interface Case {
    readonly name: string;
    readonly scenario: Scenario;
    readonly current: FlowNodeId;
    readonly expected: Record<FlowNodeId, NodeStatus>;
  }
  const idle = (
    overrides: Partial<Record<FlowNodeId, NodeStatus>>
  ): Record<FlowNodeId, NodeStatus> => ({
    ticket: "idle",
    plan: "idle",
    "plan-gate": "idle",
    build: "idle",
    check: "idle",
    review: "idle",
    "pr-review": "idle",
    ship: "idle",
    ...overrides
  });

  const cases: Case[] = [
    {
      name: "intake running",
      scenario: { stage: "intake", status: "running", steps: [["intake", "intake-started"]] },
      current: "ticket",
      expected: idle({ ticket: "running" })
    },
    {
      name: "setup running",
      scenario: {
        stage: "setup",
        status: "running",
        steps: [...INTAKE, ["setup", "stage-started"]]
      },
      current: "ticket",
      expected: idle({ ticket: "running" })
    },
    {
      name: "plan queued",
      scenario: { stage: "plan", status: "queued", steps: [...INTAKE, ...SETUP] },
      current: "plan",
      expected: idle({ ticket: "passed", plan: "running" })
    },
    {
      name: "plan running",
      scenario: { stage: "plan", status: "running", steps: [...INTAKE, ...SETUP, PLAN[0]!] },
      current: "plan",
      expected: idle({ ticket: "passed", plan: "running" })
    },
    {
      name: "waiting at the plan gate",
      scenario: { stage: "plan-gate", status: "waiting", steps: TO_PLAN_GATE },
      current: "plan-gate",
      expected: idle({ ticket: "passed", plan: "passed", "plan-gate": "waiting" })
    },
    {
      name: "build running",
      scenario: { stage: "build", status: "running", steps: [...TO_BUILD, BUILD[0]!] },
      current: "build",
      expected: idle({ ticket: "passed", plan: "passed", "plan-gate": "passed", build: "running" })
    },
    {
      name: "check running",
      scenario: {
        stage: "check",
        status: "running",
        steps: [...TO_BUILD, ...BUILD, CHECK_PASS[0]!]
      },
      current: "check",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "passed",
        check: "running"
      })
    },
    {
      name: "check failed, builder runs again",
      scenario: {
        stage: "build",
        status: "running",
        steps: [...TO_BUILD, ...BUILD, ...CHECK_FAIL, BUILD[0]!]
      },
      current: "build",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "running",
        check: "looped"
      })
    },
    {
      name: "check failed then passed",
      scenario: {
        stage: "review",
        status: "running",
        steps: [...TO_BUILD, ...BUILD, ...CHECK_FAIL, ...BUILD, ...CHECK_PASS, REVIEW_OK[0]!]
      },
      current: "review",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "passed",
        check: "passed",
        review: "running"
      })
    },
    {
      name: "review asked for changes, builder runs again",
      scenario: {
        stage: "build",
        status: "running",
        steps: [...TO_REVIEW, ...REVIEW_CHANGES, BUILD[0]!]
      },
      current: "build",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "running",
        check: "passed",
        review: "looped"
      })
    },
    {
      name: "waiting at pr review",
      scenario: { stage: "pr-review", status: "waiting", steps: TO_PR_REVIEW },
      current: "pr-review",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "passed",
        check: "passed",
        review: "passed",
        "pr-review": "waiting"
      })
    },
    {
      name: "plan feedback sends the issue back to the planner",
      scenario: {
        stage: "plan",
        status: "running",
        steps: [...TO_PLAN_GATE, ["plan-gate", "feedback", "to plan"], PLAN[0]!]
      },
      current: "plan",
      expected: idle({ ticket: "passed", plan: "running", "plan-gate": "looped" })
    },
    {
      name: "shipped",
      scenario: {
        stage: "shipped",
        status: "done",
        steps: [...TO_PR_REVIEW, ["ship", "stage-started"], ["ship", "ship-complete"]]
      },
      current: "ship",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "passed",
        check: "passed",
        review: "passed",
        "pr-review": "passed",
        ship: "passed"
      })
    },
    {
      name: "shipping",
      scenario: {
        stage: "ship",
        status: "running",
        steps: [...TO_PR_REVIEW, ["ship", "stage-started"]]
      },
      current: "ship",
      expected: idle({
        ticket: "passed",
        plan: "passed",
        "plan-gate": "passed",
        build: "passed",
        check: "passed",
        review: "passed",
        "pr-review": "passed",
        ship: "running"
      })
    }
  ];

  it.each(cases)("$name", ({ scenario, current, expected }) => {
    const result = model(scenario);
    expect(result.current).toBe(current);
    expect(statuses(result)).toEqual(expected);
    expect(result.nodes.filter((entry) => entry.current).map((entry) => entry.id)).toEqual([
      current
    ]);
    expect(flowModelSchema.safeParse(result).success).toBe(true);
  });
});

describe("buildFlowModel needs-you", () => {
  const STOPS: readonly {
    readonly stage: Stage;
    readonly node: FlowNodeId;
    readonly before: Step[];
    readonly start: Step;
  }[] = [
    { stage: "intake", node: "ticket", before: [], start: ["intake", "intake-started"] },
    { stage: "setup", node: "ticket", before: INTAKE, start: ["setup", "stage-started"] },
    {
      stage: "plan",
      node: "plan",
      before: [...INTAKE, ...SETUP],
      start: ["plan", "stage-started"]
    },
    { stage: "build", node: "build", before: TO_BUILD, start: ["build", "stage-started"] },
    {
      stage: "check",
      node: "check",
      before: [...TO_BUILD, ...BUILD],
      start: ["check", "stage-started"]
    },
    {
      stage: "review",
      node: "review",
      before: TO_REVIEW,
      start: ["review", "stage-started"]
    }
  ];

  it.each(STOPS)("stops at $stage with a badge and idle downstream nodes", (stop) => {
    const result = model({
      stage: "needs-you",
      status: "waiting",
      resumeStage: stop.stage,
      steps: [
        ...stop.before,
        stop.start,
        ["needs-you", "needs-you", `Something broke in ${stop.stage}:\nsecond line`]
      ]
    });
    const stopped = node(result, stop.node);
    expect(result.current).toBe(stop.node);
    expect(stopped.status).toBe("failed");
    expect(stopped.badge).toEqual({ kind: "needs-you", text: `Something broke in ${stop.stage}` });
    expect(stopped.activity).toBeNull();
    const order = FLOW_NODE_IDS.indexOf(stop.node);
    for (const downstream of result.nodes.filter((_, index) => index > order)) {
      expect(downstream.status).toBe("idle");
      expect(downstream.badge).toBeNull();
    }
    expect(result.edges.some((entry) => entry.state === "active")).toBe(false);
  });

  it("marks the edge into the stopped node as bad", () => {
    const result = model({
      stage: "needs-you",
      status: "waiting",
      resumeStage: "check",
      steps: [...TO_BUILD, ...BUILD, CHECK_FAIL[0]!, ["needs-you", "needs-you", "checks failed"]]
    });
    expect(edge(result, "build->check")).toMatchObject({ state: "traversed", tone: "bad" });
  });

  it("does not count a failed check that went to needs-you as a loop-back", () => {
    // Three loops back to build, then a fourth failure that stops at the limit.
    const steps: Step[] = [
      ...TO_BUILD,
      ...BUILD,
      ...CHECK_FAIL,
      ...BUILD,
      ...CHECK_FAIL,
      ...BUILD,
      ...CHECK_FAIL,
      ...BUILD,
      ...CHECK_FAIL,
      ["needs-you", "needs-you", "The checks still fail after 3 fix round(s)."]
    ];
    const result = model({ stage: "needs-you", status: "waiting", resumeStage: "check", steps });
    const loop = edge(result, "check->build");
    expect(loop.count).toBe(3);
    expect(loop.tone).toBe("warn");
    expect(node(result, "check").metrics?.runs).toBe(4);
    expect(node(result, "check").badge?.text).toBe("The checks still fail after 3 fix round(s).");
  });

  it("reads the badge from an interrupted event too", () => {
    const result = model({
      stage: "needs-you",
      status: "waiting",
      resumeStage: "build",
      steps: [
        ...TO_BUILD,
        BUILD[0]!,
        ["needs-you", "interrupted", "Interrupted: the desk stopped while 'build' was running."]
      ]
    });
    expect(node(result, "build").badge?.text).toBe(
      "Interrupted: the desk stopped while 'build' was running."
    );
  });

  it("gives a stopped node without a reason a null badge text", () => {
    const result = model({
      stage: "needs-you",
      status: "waiting",
      resumeStage: "plan",
      steps: [...INTAKE, ...SETUP, PLAN[0]!]
    });
    expect(node(result, "plan").badge).toEqual({ kind: "needs-you", text: null });
  });
});

describe("buildFlowModel cancelled", () => {
  it.each([
    {
      name: "at the plan gate",
      node: "plan-gate" as const,
      steps: [...TO_PLAN_GATE, ["plan-gate", "cancelled"] as Step]
    },
    {
      name: "while the builder works",
      node: "build" as const,
      steps: [...TO_BUILD, BUILD[0]!, ["build", "cancelled"] as Step]
    },
    {
      name: "from needs-you",
      node: "check" as const,
      steps: [
        ...TO_BUILD,
        ...BUILD,
        CHECK_FAIL[0]!,
        ["needs-you", "needs-you", "stuck"] as Step,
        ["needs-you", "cancelled"] as Step
      ]
    }
  ])("$name stops that node with a cancelled badge", ({ node: expected, steps }) => {
    const result = model({ stage: "cancelled", status: "done", steps });
    expect(result.current).toBe(expected);
    expect(node(result, expected)).toMatchObject({
      status: "failed",
      badge: { kind: "cancelled", text: null }
    });
    expect(result.edges.some((entry) => entry.state === "active")).toBe(false);
    expect(flowModelSchema.safeParse(result).success).toBe(true);
  });
});

describe("buildFlowModel loops and feedback", () => {
  it("counts automatic check loops and warns", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [...TO_BUILD, ...BUILD, ...CHECK_FAIL, ...BUILD, ...CHECK_FAIL, BUILD[0]!]
    });
    expect(edge(result, "check->build")).toMatchObject({
      count: 2,
      feedbackCount: 0,
      tone: "warn",
      state: "active",
      loopKind: "check",
      dashed: true
    });
  });

  it("counts review loops with the blocking count of the latest one", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [
        ...TO_REVIEW,
        ["review", "stage-started"],
        [
          "review",
          "review-changes-requested",
          "3 blocking finding(s); 1 finding(s) outside the diff dropped"
        ],
        ...BUILD,
        ...CHECK_PASS,
        ...REVIEW_CHANGES,
        BUILD[0]!
      ]
    });
    expect(edge(result, "review->build")).toMatchObject({
      count: 2,
      blocking: 2,
      tone: "warn",
      loopKind: "review"
    });
  });

  it("leaves unused loops idle and neutral", () => {
    const result = model({ stage: "pr-review", status: "waiting", steps: TO_PR_REVIEW });
    for (const id of ["plan-gate->plan", "check->build", "review->build"]) {
      expect(edge(result, id)).toMatchObject({ state: "idle", tone: "neutral", count: 0 });
    }
  });

  it("counts a re-plan from the plan gate", () => {
    const result = model({
      stage: "plan-gate",
      status: "waiting",
      steps: [
        ...TO_PLAN_GATE,
        ["plan-gate", "feedback", "to plan"],
        ...PLAN,
        ["plan-gate", "feedback", "to plan"],
        ...PLAN
      ]
    });
    expect(edge(result, "plan-gate->plan")).toMatchObject({
      feedbackCount: 2,
      count: 0,
      state: "traversed",
      loopKind: "replan"
    });
  });

  it.each([
    { target: "build" as const, edgeId: "pr-review->build", arc: 150 },
    { target: "review" as const, edgeId: "pr-review->review", arc: 70 },
    { target: "plan" as const, edgeId: "pr-review->plan", arc: 210 }
  ])("shows PR-review feedback to $target as a dashed arc", ({ target, edgeId, arc }) => {
    const result = model({
      stage: target,
      status: "running",
      steps: [...TO_PR_REVIEW, ["pr-review", "feedback", `to ${target}`], [target, "stage-started"]]
    });
    expect(edge(result, edgeId)).toMatchObject({
      feedbackCount: 1,
      count: 0,
      dashed: true,
      state: "active",
      arc,
      loopKind: "feedback"
    });
    expect(node(result, "pr-review").status).toBe("looped");
  });

  it("keeps a used feedback arc traversed once the target moved on", () => {
    const result = model({
      stage: "pr-review",
      status: "waiting",
      steps: [
        ...TO_PR_REVIEW,
        ["pr-review", "feedback", "to build"],
        ...BUILD,
        ...CHECK_PASS,
        ...REVIEW_OK
      ]
    });
    expect(edge(result, "pr-review->build")).toMatchObject({
      state: "traversed",
      feedbackCount: 1
    });
    expect(node(result, "pr-review").status).toBe("waiting");
  });

  it("reads a PR review as passed when it was approved after earlier feedback", () => {
    const result = model({
      stage: "shipped",
      status: "done",
      steps: [
        ...TO_PR_REVIEW,
        ["pr-review", "feedback", "to build"],
        ...BUILD,
        ...CHECK_PASS,
        ...REVIEW_OK,
        ["ship", "stage-started"]
      ]
    });
    expect(node(result, "pr-review").status).toBe("passed");
  });

  it("marks the feedback arc active while the target runs", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [...TO_PR_REVIEW, ["pr-review", "feedback", "to build"], BUILD[0]!]
    });
    expect(edge(result, "pr-review->build").state).toBe("active");
    expect(node(result, "pr-review").status).toBe("looped");
  });

  it("attributes feedback given at needs-you to the stopped node when a loop edge exists", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [
        ...TO_BUILD,
        ...BUILD,
        CHECK_FAIL[0]!,
        ["needs-you", "needs-you", "stuck"],
        ["needs-you", "feedback", "to build"],
        BUILD[0]!
      ]
    });
    expect(edge(result, "check->build")).toMatchObject({ count: 0, feedbackCount: 1 });
  });

  it("falls back to the PR-review arc when no loop edge fits the stopped node", () => {
    const result = model({
      stage: "plan",
      status: "running",
      steps: [
        ...TO_BUILD,
        BUILD[0]!,
        ["needs-you", "needs-you", "builder blocked"],
        ["needs-you", "feedback", "to plan"],
        PLAN[0]!
      ]
    });
    expect(edge(result, "pr-review->plan")).toMatchObject({ feedbackCount: 1 });
  });

  it("ignores a feedback event with a note it cannot read", () => {
    const result = model({
      stage: "pr-review",
      status: "waiting",
      steps: [...TO_PR_REVIEW, ["pr-review", "feedback", "somewhere"]]
    });
    expect(result.edges.filter((entry) => entry.loopKind === "feedback")).toEqual([]);
  });
});

describe("buildFlowModel edges and activity", () => {
  it("marks the edge into the running node as active", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [...TO_BUILD, BUILD[0]!]
    });
    expect(edge(result, "plan-gate->build").state).toBe("active");
    expect(result.edges.filter((entry) => entry.state === "active")).toHaveLength(1);
    expect(edge(result, "plan->plan-gate").state).toBe("traversed");
    expect(edge(result, "build->check").state).toBe("idle");
  });

  it("counts a queued node as arrived before its start event exists", () => {
    const result = model({
      stage: "build",
      status: "queued",
      steps: [...TO_BUILD, ...BUILD, CHECK_FAIL[0]!, CHECK_FAIL[1]!]
    });
    expect(node(result, "build").status).toBe("running");
    expect(edge(result, "check->build").state).toBe("active");
  });

  it("has no active edge while the issue waits", () => {
    const result = model({ stage: "plan-gate", status: "waiting", steps: TO_PLAN_GATE });
    expect(result.edges.some((entry) => entry.state === "active")).toBe(false);
  });

  it("shows the latest event as activity only on the driven node", () => {
    const result = model({
      stage: "build",
      status: "running",
      steps: [...TO_BUILD, BUILD[0]!]
    });
    expect(node(result, "build").activity).toMatchObject({ event: "stage-started", note: null });
    expect(result.nodes.filter((entry) => entry.activity !== null)).toHaveLength(1);
  });
});

describe("buildFlowModel metrics", () => {
  it("counts runs and measures a finished run up to the next event", () => {
    const result = model({
      stage: "pr-review",
      status: "waiting",
      steps: [...TO_BUILD, ...BUILD, ...CHECK_FAIL, ...BUILD, ...CHECK_PASS, ...REVIEW_OK]
    });
    expect(node(result, "build").metrics).toEqual({
      runs: 2,
      lastDurationMs: STEP_MS,
      ongoing: false
    });
    expect(node(result, "check").metrics?.runs).toBe(2);
  });

  it("runs the clock of the driven node to now", () => {
    const steps: Step[] = [...TO_BUILD, BUILD[0]!];
    const started = T0 + (steps.length - 1) * STEP_MS;
    const result = model({ stage: "build", status: "running", steps }, started + 42_000);
    expect(node(result, "build").metrics).toEqual({
      runs: 1,
      lastDurationMs: 42_000,
      ongoing: true
    });
  });

  it("measures how long a gate has waited", () => {
    const steps = TO_PLAN_GATE;
    const arrived = T0 + (steps.length - 1) * STEP_MS;
    const result = model({ stage: "plan-gate", status: "waiting", steps }, arrived + 90_000);
    expect(node(result, "plan-gate").metrics).toEqual({
      runs: 1,
      lastDurationMs: 90_000,
      ongoing: true
    });
  });

  it("stops the clock of a finished issue at its last update", () => {
    const steps: Step[] = [...TO_PR_REVIEW, ["ship", "stage-started"], ["ship", "ship-complete"]];
    const result = model({ stage: "shipped", status: "done", steps }, AFTER_LAST + 99 * 3_600_000);
    expect(node(result, "ship").metrics).toEqual({
      runs: 1,
      lastDurationMs: STEP_MS,
      ongoing: false
    });
  });

  it("falls back to intake starts for the run count of the ticket node", () => {
    const result = model({
      stage: "needs-you",
      status: "waiting",
      resumeStage: "intake",
      steps: [
        ["intake", "intake-started"],
        ["needs-you", "needs-you", "closed"],
        ["intake", "intake-restarted"],
        ["needs-you", "needs-you", "closed"]
      ]
    });
    expect(node(result, "ticket").metrics?.runs).toBe(2);
  });

  it("has no metrics for a node that never ran", () => {
    const result = model({ stage: "plan-gate", status: "waiting", steps: TO_PLAN_GATE });
    expect(node(result, "build").metrics).toBeNull();
    expect(node(result, "ship").metrics).toBeNull();
  });

  it("is pure: the same input gives the same output", () => {
    const scenario: Scenario = { stage: "pr-review", status: "waiting", steps: TO_PR_REVIEW };
    expect(model(scenario)).toEqual(model(scenario));
  });
});
