import { describe, expect, it } from "vitest";

import {
  AGENT_OUTPUT_ROLES,
  REVIEW_SECTIONS,
  agentOutputJsonSchema,
  agentOutputSchemas,
  builderOutputSchema,
  fitConfidence,
  intakeOutputSchema,
  plannerOutputSchema,
  reviewerOutputSchema,
  type PlannerOutput,
  type ReviewerOutput
} from "./agent-output.contract";

const planner = (): PlannerOutput => ({
  summary: "Add the contracts",
  files: [{ path: "tooling/desk/src/a.ts", action: "create", purpose: "contract" }],
  tests: [{ path: "tooling/desk/src/a.test.ts", action: "create", reason: "prove parsing" }],
  acceptanceCriteria: [{ criterion: "Parses output", change: "a.ts schema" }],
  risks: [],
  openQuestions: [],
  changeset: { required: true, packages: ["@repo/desk"], bump: "minor" },
  pr: { type: "feat", slug: "desk-contracts" },
  plainLanguage: "We add the rules for agent output."
});

const reviewer = (): ReviewerOutput => ({
  verdict: "approve",
  findings: [
    {
      severity: "Nit",
      blocking: false,
      file: "a.ts",
      line: 3,
      section: "Quality Gates",
      summary: "Rename",
      fix: ""
    }
  ],
  acceptanceStatus: [{ criterion: "Parses output", status: "met", evidence: "a.test.ts" }],
  reviewSections: REVIEW_SECTIONS.map((heading) => ({ heading, verdict: "pass", notes: "" })),
  prDraft: { title: "feat(desk): contracts", body: "Closes #1" },
  plainLanguage: "The change is fine."
});

describe("planner output", () => {
  it("accepts a complete plan", () => {
    expect(plannerOutputSchema.safeParse(planner()).success).toBe(true);
  });

  it.each([
    [
      "a required changeset with no packages",
      { changeset: { required: true, packages: [], bump: "patch" } }
    ],
    ["an unknown PR type", { pr: { type: "feature", slug: "x" } }],
    ["a slug with spaces or capitals", { pr: { type: "feat", slug: "Desk Contracts" } }],
    ["an empty summary", { summary: "" }],
    ["a missing plain-language field", { plainLanguage: undefined }]
  ])("rejects %s", (_name, patch) => {
    expect(plannerOutputSchema.safeParse({ ...planner(), ...patch }).success).toBe(false);
  });

  it("accepts a changeset that is not required and lists no packages", () => {
    const plan = { ...planner(), changeset: { required: false, packages: [], bump: "patch" } };
    expect(plannerOutputSchema.safeParse(plan).success).toBe(true);
  });
});

describe("builder output", () => {
  const builder = {
    summary: "Built it",
    filesChanged: ["a.ts"],
    notes: [],
    blockers: [],
    claimedChecks: [{ command: "pnpm --filter @repo/desk test", result: "pass" }],
    plainLanguage: "Done."
  };

  it("accepts a complete result", () => {
    expect(builderOutputSchema.safeParse(builder).success).toBe(true);
  });

  it("rejects an unknown check result", () => {
    const bad = { ...builder, claimedChecks: [{ command: "x", result: "green" }] };
    expect(builderOutputSchema.safeParse(bad).success).toBe(false);
  });
});

describe("reviewer output", () => {
  it("accepts a complete review", () => {
    expect(reviewerOutputSchema.safeParse(reviewer()).success).toBe(true);
  });

  it("requires all nine REVIEW.md headings exactly once", () => {
    const missing = { ...reviewer(), reviewSections: reviewer().reviewSections.slice(1) };
    expect(reviewerOutputSchema.safeParse(missing).success).toBe(false);

    const duplicated = {
      ...reviewer(),
      reviewSections: [...reviewer().reviewSections, reviewer().reviewSections[0]]
    };
    expect(reviewerOutputSchema.safeParse(duplicated).success).toBe(false);
  });

  it("mirrors the headings in .ai/ai.util.ts", () => {
    expect(REVIEW_SECTIONS).toEqual([
      "Correctness",
      "Security, Auth & Tenancy",
      "Architecture & Boundaries",
      "Data & GraphQL",
      "Performance",
      "UI & i18n",
      "Quality Gates",
      "Domain Language",
      "Template & AI Hygiene"
    ]);
  });

  it("rejects an approval that carries a blocking finding", () => {
    const base = reviewer();
    const [first] = base.findings;
    const blocked = {
      ...base,
      findings: [{ ...first, severity: "Critical", blocking: true }]
    };
    expect(reviewerOutputSchema.safeParse(blocked).success).toBe(false);
    expect(
      reviewerOutputSchema.safeParse({ ...blocked, verdict: "changes-requested" }).success
    ).toBe(true);
  });

  it("rejects an unknown severity label and a finding without a line", () => {
    const [first] = reviewer().findings;
    expect(
      reviewerOutputSchema.safeParse({
        ...reviewer(),
        findings: [{ ...first, severity: "Blocker" }]
      }).success
    ).toBe(false);
    expect(
      reviewerOutputSchema.safeParse({ ...reviewer(), findings: [{ ...first, line: 0 }] }).success
    ).toBe(false);
  });
});

describe("intake output", () => {
  const output = {
    recommendation: "needs-info",
    reasons: ["clear"],
    fit: {
      clarity: { score: 3, reason: "One reading only." },
      complexity: { score: 2, reason: "Two workspaces." },
      verifiability: { score: 3, reason: "Each criterion maps to a test." }
    },
    draft: {
      outcome: "Reports export as CSV.",
      acceptanceCriteria: ["The button downloads a CSV"],
      scope: "apps/web",
      validation: "pnpm check",
      evidence: "unknown, investigate first",
      outOfScope: []
    },
    unknowns: [{ section: "evidence", question: "Where does the export fail today?" }],
    plainLanguage: "The page should export reports."
  };

  it("accepts each recommendation and requires a reason", () => {
    for (const recommendation of [
      "ready-for-agent",
      "needs-spec",
      "needs-info",
      "ready-for-human"
    ]) {
      expect(intakeOutputSchema.safeParse({ ...output, recommendation }).success).toBe(true);
    }
    expect(intakeOutputSchema.safeParse({ ...output, reasons: [] }).success).toBe(false);
    expect(intakeOutputSchema.safeParse({ ...output, recommendation: "maybe" }).success).toBe(
      false
    );
  });

  it("allows empty criteria (the draft then stops) but no empty section text or unknown section", () => {
    const draft = (over: Record<string, unknown>) =>
      intakeOutputSchema.safeParse({ ...output, draft: { ...output.draft, ...over } }).success;
    expect(draft({ acceptanceCriteria: [] })).toBe(true);
    expect(draft({ scope: "" })).toBe(false);
    expect(
      intakeOutputSchema.safeParse({
        ...output,
        unknowns: [{ section: "context", question: "x" }]
      }).success
    ).toBe(false);
  });
});

describe("intake fit", () => {
  const fit = (clarity: number, complexity: number, verifiability: number) => ({
    clarity: { score: clarity, reason: "c" },
    complexity: { score: complexity, reason: "x" },
    verifiability: { score: verifiability, reason: "v" }
  });
  const base = {
    recommendation: "ready-for-agent",
    reasons: ["clear"],
    draft: {
      outcome: "o",
      acceptanceCriteria: ["a"],
      scope: "s",
      validation: "v",
      evidence: "e",
      outOfScope: []
    },
    unknowns: [],
    plainLanguage: "p"
  };

  it.each([
    ["a score of 0", { fit: fit(0, 2, 2) }],
    ["a score of 4", { fit: fit(3, 4, 2) }],
    ["a fractional score", { fit: fit(2.5, 2, 2) }],
    ["a missing reason", { fit: { ...fit(3, 3, 3), verifiability: { score: 3, reason: "" } } }],
    ["a blank reason", { fit: { ...fit(3, 3, 3), clarity: { score: 3, reason: "   " } } }],
    [
      "a reason over two lines",
      { fit: { ...fit(3, 3, 3), complexity: { score: 3, reason: "One file.\nAlso a migration." } } }
    ],
    ["no fit", {}]
  ])("rejects %s", (_name, over) => {
    expect(intakeOutputSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });

  it("is confident only as far as the weakest grade", () => {
    expect(fitConfidence(fit(3, 3, 3))).toBe(3);
    expect(fitConfidence(fit(3, 1, 2))).toBe(1);
    expect(fitConfidence(fit(2, 3, 3))).toBe(2);
  });
});

describe("JSON Schema generation", () => {
  it.each(AGENT_OUTPUT_ROLES)("produces an object schema for %s", (role) => {
    const schema = agentOutputJsonSchema(role);
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });

  it("requires every property, so strict-schema providers accept it", () => {
    for (const role of AGENT_OUTPUT_ROLES) {
      const schema = agentOutputJsonSchema(role);
      expect([...(schema.required ?? [])].sort()).toEqual(
        Object.keys(schema.properties ?? {}).sort()
      );
    }
  });

  it("registers a parser for every role", () => {
    expect(Object.keys(agentOutputSchemas).sort()).toEqual([...AGENT_OUTPUT_ROLES].sort());
  });
});
