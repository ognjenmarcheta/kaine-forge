import { describe, expect, it } from "vitest";

import type { AgentDefinition } from "./agent-definition.contract";
import { jobStartRequestSchema, specialistProblem } from "./job.contract";

const agent = (
  output: AgentDefinition["output"],
  preset: AgentDefinition["capabilities"]["preset"]
): Pick<AgentDefinition, "id" | "output" | "capabilities"> => ({
  id: "product-strategist",
  output,
  capabilities: { preset, mcp: [], skills: [], tools: [] }
});

describe("specialistProblem", () => {
  it.each([
    ["read-only", null],
    ["run-checks", null],
    [
      "edit-code",
      "The agent product-strategist has the edit-code preset. A specialist job runs read-only and run-checks agents only."
    ]
  ] as const)("a report agent with the %s preset: %s", (preset, problem) => {
    expect(specialistProblem(agent("report", preset))).toBe(problem);
  });

  it("refuses an agent that does not return a report", () => {
    expect(specialistProblem(agent("review", "read-only"))).toBe(
      "The agent product-strategist returns a review, not a report. A specialist job runs report agents only."
    );
  });
});

describe("a specialist job's start request", () => {
  it.each([
    { kind: "path", value: "apps/web/src/features/todos" },
    { kind: "issue", value: 42 },
    { kind: "brief", value: "Check the sign-in copy." }
  ])("takes a $kind target", (target) => {
    const parsed = jobStartRequestSchema.safeParse({
      kind: "specialist",
      specialist: { agentId: "product-strategist", target }
    });
    expect(parsed.success).toBe(true);
  });

  it.each(["apps/mobile/app/(app)/dashboard.tsx", "apps/web/src/routes/[id]/+page.tsx"])(
    "takes the real file path %s",
    (value) => {
      const parsed = jobStartRequestSchema.safeParse({
        kind: "specialist",
        specialist: { agentId: "product-strategist", target: { kind: "path", value } }
      });
      expect(parsed.success).toBe(true);
    }
  );

  it.each([
    ["a path out of the checkout", { kind: "path", value: "apps/../../etc" }],
    [
      "a path out of the checkout through a route group",
      { kind: "path", value: "apps/mobile/app/(app)/../../../../etc" }
    ],
    ["an absolute path", { kind: "path", value: "/etc/passwd" }],
    ["an empty brief", { kind: "brief", value: "  " }],
    ["an issue number as text", { kind: "issue", value: "42" }]
  ])("refuses %s", (_case, target) => {
    const parsed = jobStartRequestSchema.safeParse({
      kind: "specialist",
      specialist: { agentId: "product-strategist", target }
    });
    expect(parsed.success).toBe(false);
  });

  it("needs a specialist for a specialist job, and refuses one on another kind", () => {
    expect(jobStartRequestSchema.safeParse({ kind: "specialist" }).success).toBe(false);
    expect(
      jobStartRequestSchema.safeParse({
        kind: "scorecard",
        specialist: { agentId: "product-strategist", target: { kind: "brief", value: "x" } }
      }).success
    ).toBe(false);
  });
});
