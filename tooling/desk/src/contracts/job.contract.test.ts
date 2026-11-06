import { describe, expect, it } from "vitest";

import type { AgentDefinition } from "./agent-definition.contract";
import { jobStartRequestSchema, roleAgentProblem } from "./job.contract";

const agent = (
  output: AgentDefinition["output"],
  preset: AgentDefinition["capabilities"]["preset"]
): Pick<AgentDefinition, "id" | "output" | "capabilities"> => ({
  id: "product-reviewer",
  output,
  capabilities: { preset, mcp: [], skills: [], tools: [] }
});

describe("roleAgentProblem", () => {
  it.each([
    ["read-only", null],
    ["run-checks", null],
    [
      "edit-code",
      "The agent product-reviewer has the edit-code preset. A role job runs read-only and run-checks agents only."
    ]
  ] as const)("a report agent with the %s preset: %s", (preset, problem) => {
    expect(roleAgentProblem(agent("report", preset))).toBe(problem);
  });

  it("refuses an agent that does not return a report", () => {
    expect(roleAgentProblem(agent("review", "read-only"))).toBe(
      "The agent product-reviewer returns a review, not a report. A role job runs report agents only."
    );
  });
});

describe("a role job's start request", () => {
  it.each([
    { kind: "path", value: "apps/web/src/features/todos" },
    { kind: "issue", value: 42 },
    { kind: "brief", value: "Check the sign-in copy." }
  ])("takes a $kind target", (target) => {
    const parsed = jobStartRequestSchema.safeParse({
      kind: "role",
      role: { agentId: "product-reviewer", target }
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["a path out of the checkout", { kind: "path", value: "apps/../../etc" }],
    ["an absolute path", { kind: "path", value: "/etc/passwd" }],
    ["an empty brief", { kind: "brief", value: "  " }],
    ["an issue number as text", { kind: "issue", value: "42" }]
  ])("refuses %s", (_case, target) => {
    const parsed = jobStartRequestSchema.safeParse({
      kind: "role",
      role: { agentId: "product-reviewer", target }
    });
    expect(parsed.success).toBe(false);
  });

  it("needs a role for a role job, and refuses one on another kind", () => {
    expect(jobStartRequestSchema.safeParse({ kind: "role" }).success).toBe(false);
    expect(
      jobStartRequestSchema.safeParse({
        kind: "scorecard",
        role: { agentId: "product-reviewer", target: { kind: "brief", value: "x" } }
      }).success
    ).toBe(false);
  });
});
