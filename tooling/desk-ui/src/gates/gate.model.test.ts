import type { FlowStepView } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { incidentOf, orderReviewFiles, resumeCommandOf, shipsWithoutReview } from "./gate.model";
import { scenarioRuns } from "../../tests/fixture.data";
import { parseDiffFiles } from "../artifacts/artifact.diffstat";
import type { IssueFlow } from "../flow/flow.steps";
import { makeDetail } from "../test/test.render";

const file = (path: string) => `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;

describe("orderReviewFiles", () => {
  it("puts files with findings first, then other source, then translations and tests", () => {
    const files = parseDiffFiles(
      [
        "packages/translation/src/locales/en/desk.json",
        "src/board.test.tsx",
        "src/board.tsx",
        "src/board.empty.tsx"
      ]
        .map(file)
        .join("")
    );
    const finding = {
      severity: "Consider" as const,
      blocking: false,
      file: "src/board.test.tsx",
      line: 1,
      section: "Tests",
      summary: "Cover the empty case",
      fix: ""
    };
    expect(
      orderReviewFiles(files, [finding]).map((entry) => [
        entry.file.path,
        entry.group,
        entry.findings.length
      ])
    ).toEqual([
      ["src/board.test.tsx", "findings", 1],
      ["src/board.tsx", "source", 0],
      ["src/board.empty.tsx", "source", 0],
      ["packages/translation/src/locales/en/desk.json", "support", 0]
    ]);
  });
});

describe("incidentOf", () => {
  const stuck = scenarioRuns().find((run) => run.failureKind === "stuck");

  it.each([
    ["the latest run failed in a known way", { runs: stuck === undefined ? [] : [stuck] }, "stuck"],
    ["the check failed the same way again", {}, "repeat"],
    ["nothing points at a cause", { fingerprint: null }, null]
  ] as const)("names a likely cause only when %s", (_name, extra, cause) => {
    const { detail } = makeDetail(
      {
        stage: "needs-you",
        resumeStage: "build",
        loops: { check: 2, review: 0 },
        lastCheckFingerprint: "fingerprint" in extra ? extra.fingerprint : "board-test"
      },
      { needsYouReason: "Two checks failed the same way" }
    );
    const incident = incidentOf({ ...detail, runs: "runs" in extra ? extra.runs : [] });
    expect(incident).toEqual({ stage: "build", reason: "Two checks failed the same way", cause });
  });
});

describe("resumeCommandOf", () => {
  it("prefers the builder session and skips sessions without a command", () => {
    const { detail } = makeDetail();
    const resume = {
      worktreePath: "/w",
      sessions: [
        { role: "planner" as const, sessionId: "p", provider: "claude" as const, command: "plan" },
        { role: "builder" as const, sessionId: "b", provider: null, command: null }
      ]
    };
    expect(resumeCommandOf({ ...detail, resume })).toBe("plan");
    const both = {
      worktreePath: "/w",
      sessions: [
        { role: "planner" as const, sessionId: "p", provider: "claude" as const, command: "plan" },
        { role: "builder" as const, sessionId: "b", provider: "claude" as const, command: "build" }
      ]
    };
    expect(resumeCommandOf({ ...detail, resume: both })).toBe("build");
    expect(resumeCommandOf({ ...detail, resume: { worktreePath: null, sessions: [] } })).toBeNull();
  });
});

describe("shipsWithoutReview", () => {
  const step = (id: string, kind: FlowStepView["kind"], auto = false): FlowStepView => ({
    id,
    label: id,
    kind,
    agent: null,
    sendBack: [],
    auto
  });
  const flowOf = (...steps: FlowStepView[]): IssueFlow => ({ source: "local", steps });

  it("is true only when an automatic ship follows the gate with no gate in between", () => {
    const autoNoGate = flowOf(
      step("plan-gate", "gate"),
      step("build", "agent"),
      step("ship", "ship", true)
    );
    const autoAfterGate = flowOf(
      step("plan-gate", "gate"),
      step("pr-review", "gate"),
      step("ship", "ship", true)
    );
    const manual = flowOf(step("plan-gate", "gate"), step("ship", "ship"));
    expect(shipsWithoutReview(autoNoGate, "plan-gate")).toBe(true);
    expect(shipsWithoutReview(autoAfterGate, "plan-gate")).toBe(false);
    expect(shipsWithoutReview(manual, "plan-gate")).toBe(false);
  });
});
