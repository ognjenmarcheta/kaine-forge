import { describe, expect, it } from "vitest";

import { agentRunLessons, checkLessons } from "./pipeline.lessons";
import type { CheckReport } from "../check";

const evidence = (checkout: string, command: string) =>
  agentRunLessons({
    role: "builder",
    checkout,
    stuckOn: command,
    stuckReason: null,
    denials: [{ tool: "Bash", command: `git -C ${checkout} push origin HEAD`, paths: [] }],
    violations: [
      { kind: "permission-denied", message: "Permission denied for Bash: git push" },
      { kind: "scope", message: `Changed ${checkout}/src/other.ts outside the plan` }
    ],
    invariants: ["refs"]
  });

describe("agentRunLessons", () => {
  it("gives the same keys in every worktree, so a problem can be seen again in another issue", () => {
    const first = evidence(
      "/repo.worktrees/KAINE-12",
      "pnpm --filter /repo.worktrees/KAINE-12/app test"
    );
    const second = evidence(
      "/repo.worktrees/KAINE-40-feat-export",
      "pnpm --filter /repo.worktrees/KAINE-40-feat-export/app test"
    );

    expect(first.map((observation) => observation.key)).toEqual([
      "stuck/pnpm --filter <dir>/app test",
      "denial/Bash/git",
      "verify/scope",
      "invariant/refs"
    ]);
    expect(second.map((observation) => observation.key)).toEqual(
      first.map((observation) => observation.key)
    );
    // A permission denial is counted once, as a denial, not again as a violation.
    expect(first.filter((observation) => observation.source === "verify")).toHaveLength(1);
  });
});

describe("checkLessons", () => {
  const report = (over: Partial<CheckReport>): CheckReport => ({
    passed: false,
    kind: "loop",
    steps: [
      { argv: ["pnpm", "lint"], code: 0, timedOut: false, tail: "", durationMs: 1 },
      { argv: ["pnpm", "typecheck"], code: null, timedOut: true, tail: "", durationMs: 1 },
      { argv: ["pnpm", "test"], code: 1, timedOut: false, tail: "", durationMs: 1 }
    ],
    fingerprint: "f".repeat(64),
    diffHash: "0".repeat(64),
    generatedDrift: false,
    startedAt: "2026-10-13T09:00:00.000Z",
    finishedAt: "2026-10-13T09:01:00.000Z",
    ...over
  });

  it("names the first step that failed or timed out, or the generated drift", () => {
    expect(checkLessons(report({})).map((observation) => observation.key)).toEqual([
      "check/pnpm typecheck (timeout)"
    ]);
    expect(checkLessons(report({ generatedDrift: true }))[0]?.key).toBe("check/generated-drift");
    expect(checkLessons(report({ passed: true }))).toEqual([]);
  });
});
