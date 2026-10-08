import { describe, expect, it } from "vitest";

import type { IssueState } from "../contracts";
import {
  AGENT_LABELS,
  LABEL_DEFINITIONS,
  applyLabelChange,
  bestEffort,
  labelCreateArgv,
  labelForState,
  labelSyncCommands,
  planLabelChange
} from "./github.labels";
import { fakeGitHub } from "../testing/github.fake";

const state = (over: Partial<IssueState>): IssueState => ({
  schemaVersion: 1,
  issueNumber: 7,
  stage: "plan",
  status: "running",
  resumeStage: null,
  branch: null,
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history: [],
  authorization: null,
  createdAt: "2026-10-07T09:00:00Z",
  updatedAt: "2026-10-07T09:00:00Z",
  ...over
});

describe("planLabelChange", () => {
  it("adds the target when absent", () => {
    expect(planLabelChange(["bug"], "agent:working")).toEqual({
      add: ["agent:working"],
      remove: []
    });
  });

  it("keeps the labels mutually exclusive", () => {
    expect(planLabelChange(["agent:working", "agent:pr-open"], "agent:needs-you")).toEqual({
      add: ["agent:needs-you"],
      remove: ["agent:working", "agent:pr-open"]
    });
  });

  it("does nothing when the target is already the only agent label", () => {
    expect(planLabelChange(["agent:working", "bug"], "agent:working")).toEqual({
      add: [],
      remove: []
    });
  });

  it("removes every agent label for a null target", () => {
    expect(planLabelChange(["agent:needs-you"], null)).toEqual({
      add: [],
      remove: ["agent:needs-you"]
    });
  });

  it("never mentions a triage label or any non-agent label", () => {
    const triage = [
      "ready-for-agent",
      "needs-info",
      "needs-spec",
      "ready-for-human",
      "needs-triage",
      "wontfix",
      "bug"
    ];
    for (const target of [...AGENT_LABELS, null]) {
      const change = planLabelChange([...triage, "agent:working"], target);
      for (const name of [...change.add, ...change.remove]) {
        expect(AGENT_LABELS).toContain(name);
      }
    }
  });
});

describe("labelForState", () => {
  it.each([
    [{ stage: "plan", status: "running" }, "agent:working"],
    [{ stage: "build", status: "queued" }, "agent:working"],
    [{ stage: "plan-gate", status: "waiting" }, "agent:needs-you"],
    [{ stage: "pr-review", status: "idle" }, "agent:needs-you"],
    [{ stage: "needs-you", status: "waiting", resumeStage: "build" }, "agent:needs-you"],
    [{ stage: "setup", status: "waiting" }, "agent:needs-you"],
    [{ stage: "check", status: "failed" }, "agent:needs-you"],
    [{ stage: "shipped", status: "done" }, "agent:pr-open"],
    [{ stage: "cancelled", status: "done" }, null],
    [{ stage: "intake", status: "idle" }, null]
  ] as const)("maps %j to %s", (over, expected) => {
    expect(labelForState(state(over))).toBe(expected);
  });
});

describe("best-effort write-back", () => {
  it("logs a failure and never throws", async () => {
    const logs: string[] = [];
    const outcome = await applyLabelChange(
      fakeGitHub({ failLabels: true }),
      7,
      { add: ["agent:needs-you"], remove: [] },
      (message) => logs.push(message)
    );
    expect(outcome.ok).toBe(false);
    expect(logs[0]).toContain("write-back skipped (labels)");
    expect(logs[0]).toContain("not found");
  });

  it("applies a change through the port", async () => {
    const github = fakeGitHub();
    await applyLabelChange(github, 7, { add: ["agent:working"], remove: [] }, () => undefined);
    expect(github.labelEdits).toEqual([
      { issue: 7, change: { add: ["agent:working"], remove: [] } }
    ]);
  });

  it("skips the call for an empty change", async () => {
    const github = fakeGitHub();
    await applyLabelChange(github, 7, { add: [], remove: [] }, () => undefined);
    expect(github.labelEdits).toEqual([]);
  });

  it("bestEffort reports non-Error rejections", async () => {
    const logs: string[] = [];
    const outcome = await bestEffort(
      "x",
      () => Promise.reject("plain"),
      (m) => logs.push(m)
    );
    expect(outcome).toEqual({ ok: false, error: "plain" });
    expect(logs).toHaveLength(1);
  });
});

describe("label definitions", () => {
  it("defines each agent label once with a color and a short description", () => {
    expect(LABEL_DEFINITIONS.map((definition) => definition.name)).toEqual([...AGENT_LABELS]);
    for (const definition of LABEL_DEFINITIONS) {
      expect(definition.color).toMatch(/^[0-9a-f]{6}$/);
      expect(definition.description.length).toBeLessThanOrEqual(100);
    }
  });

  it("prints one gh label create command per label, without a shell-unsafe value", () => {
    const commands = labelSyncCommands();
    expect(commands).toHaveLength(3);
    expect(commands[0]).toBe(
      'gh label create agent:working --color 1d76db --description "The agent desk is working on this issue" --force'
    );
    for (const command of commands) expect(command).not.toMatch(/[;&|$`]/);
  });

  it("builds argv for gh label create", () => {
    const [first] = LABEL_DEFINITIONS;
    expect(first && labelCreateArgv(first)).toEqual([
      "label",
      "create",
      "agent:working",
      "--color",
      "1d76db",
      "--description",
      "The agent desk is working on this issue",
      "--force"
    ]);
  });
});
