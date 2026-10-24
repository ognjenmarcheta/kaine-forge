import { describe, expect, it } from "vitest";

import { issueStateSchema, type FlowSnapshot, type IssueState } from "../contracts";
import { shipAdmission, type ShipIntent } from "./ship.admission";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

/** The default flow with an automatic ship: the gate before it is an ordinary gate. */
const AUTO_SNAPSHOT: FlowSnapshot = {
  ...DEFAULT_SNAPSHOT,
  flow: {
    ...DEFAULT_SNAPSHOT.flow,
    steps: DEFAULT_SNAPSHOT.flow.steps.map((step) =>
      step.kind === "ship" ? { ...step, auto: true } : step
    )
  }
};

const stateAt = (
  stage: string,
  over: Partial<IssueState> = {},
  flowSnapshot: FlowSnapshot = DEFAULT_SNAPSHOT
): IssueState =>
  issueStateSchema.parse({
    schemaVersion: 2,
    flowSnapshot,
    issueNumber: 7,
    stage,
    status: "waiting",
    resumeStage: null,
    branch: null,
    worktreePath: null,
    sessions: {},
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
    history: [],
    authorization: null,
    createdAt: "2026-10-07T09:00:00.000Z",
    updatedAt: "2026-10-07T09:00:00.000Z",
    ...over
  });

describe("shipAdmission", () => {
  const cases: readonly {
    readonly name: string;
    readonly state: IssueState;
    readonly intent: ShipIntent;
    readonly writeback?: boolean;
    readonly dryRun?: boolean;
    readonly refusal: "invalid-transition" | "ship-refused" | null;
  }[] = [
    {
      name: "confirmed at the ship gate",
      state: stateAt("pr-review"),
      intent: "confirmed",
      refusal: null
    },
    {
      name: "confirmed at the plan gate",
      state: stateAt("plan-gate"),
      intent: "confirmed",
      refusal: "invalid-transition"
    },
    {
      name: "confirmed at a gate before an automatic ship",
      state: stateAt("pr-review", {}, AUTO_SNAPSHOT),
      intent: "confirmed",
      refusal: "invalid-transition"
    },
    {
      name: "automatic at an automatic ship step",
      state: stateAt("ship", {}, AUTO_SNAPSHOT),
      intent: "automatic",
      refusal: null
    },
    {
      name: "automatic at a ship the owner confirms",
      state: stateAt("ship"),
      intent: "automatic",
      refusal: "invalid-transition"
    },
    {
      name: "retry of a confirmed ship, before continue",
      state: stateAt("needs-you", { resumeStage: "ship", shipConfirmed: true }),
      intent: "retry",
      refusal: null
    },
    {
      name: "retry of a confirmed ship, at the ship step",
      state: stateAt("ship", { shipConfirmed: true }),
      intent: "retry",
      refusal: null
    },
    {
      name: "retry of an automatic ship that nobody confirmed",
      state: stateAt("needs-you", { resumeStage: "ship" }, AUTO_SNAPSHOT),
      intent: "retry",
      refusal: null
    },
    {
      name: "retry of a ship the owner never confirmed",
      state: stateAt("needs-you", { resumeStage: "ship" }),
      intent: "retry",
      refusal: "ship-refused"
    },
    {
      name: "retry from a stop at another step",
      state: stateAt("needs-you", { resumeStage: "build", shipConfirmed: true }),
      intent: "retry",
      refusal: "ship-refused"
    },
    {
      name: "confirmed without write-back",
      state: stateAt("pr-review"),
      intent: "confirmed",
      writeback: false,
      refusal: "ship-refused"
    },
    {
      name: "a dry run without write-back",
      state: stateAt("pr-review"),
      intent: "confirmed",
      writeback: false,
      dryRun: true,
      refusal: null
    }
  ];

  it.each(cases)("$name", ({ state, intent, writeback, dryRun, refusal }) => {
    const admission = shipAdmission(state, intent, { writeback: writeback ?? true, dryRun });
    expect(admission.ok ? null : admission.refusal).toBe(refusal);
  });
});
