import { z } from "zod";

/**
 * Structured results from the desk agents. Providers receive these as JSON
 * Schema, and the engine parses every result again at the boundary. Fields
 * are required (never optional) so strict-schema providers accept them: use
 * an empty array or `null` for "nothing to report".
 */

/** Conventional Commit types. They match commitlint and the PR labeler. */
export const CONVENTIONAL_TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test"
] as const;
export const conventionalTypeSchema = z.enum(CONVENTIONAL_TYPES);
export type ConventionalType = z.infer<typeof conventionalTypeSchema>;

const nonEmpty = z.string().min(1);

/** Mirrors REVIEW_REQUIRED_HEADINGS in `.ai/ai.util.ts` and the REVIEW.md headings. */
export const REVIEW_SECTIONS = [
  "Correctness",
  "Security, Auth & Tenancy",
  "Architecture & Boundaries",
  "Data & GraphQL",
  "Performance",
  "UI & i18n",
  "Quality Gates",
  "Domain Language",
  "Template & AI Hygiene"
] as const;
export const reviewSectionSchema = z.enum(REVIEW_SECTIONS);
export type ReviewSection = z.infer<typeof reviewSectionSchema>;

export const AGENT_OUTPUT_ROLES = ["intake", "planner", "builder", "reviewer"] as const;
export type AgentOutputRole = (typeof AGENT_OUTPUT_ROLES)[number];

// --- intake ---------------------------------------------------------------

export const INTAKE_RECOMMENDATIONS = [
  "ready-for-agent",
  "needs-spec",
  "needs-info",
  "ready-for-human"
] as const;

export const intakeOutputSchema = z
  .object({
    recommendation: z.enum(INTAKE_RECOMMENDATIONS),
    reasons: z.array(nonEmpty).min(1)
  })
  .strict();
export type IntakeOutput = z.infer<typeof intakeOutputSchema>;

// --- planner --------------------------------------------------------------

export const plannerOutputSchema = z
  .object({
    summary: nonEmpty,
    files: z.array(
      z
        .object({
          path: nonEmpty,
          action: z.enum(["create", "modify", "delete"]),
          purpose: nonEmpty
        })
        .strict()
    ),
    tests: z.array(
      z
        .object({
          path: nonEmpty,
          action: z.enum(["create", "modify"]),
          reason: nonEmpty
        })
        .strict()
    ),
    /** Each acceptance criterion maps to the change that satisfies it. */
    acceptanceCriteria: z.array(z.object({ criterion: nonEmpty, change: nonEmpty }).strict()),
    risks: z.array(nonEmpty),
    openQuestions: z.array(nonEmpty),
    changeset: z
      .object({
        required: z.boolean(),
        packages: z.array(nonEmpty),
        bump: z.enum(["patch", "minor", "major"])
      })
      .strict()
      .refine((changeset) => !changeset.required || changeset.packages.length > 0, {
        message: "A required changeset names at least one package",
        path: ["packages"]
      }),
    pr: z
      .object({
        type: conventionalTypeSchema,
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase, hyphen-separated slug")
      })
      .strict(),
    plainLanguage: nonEmpty
  })
  .strict();
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// --- builder --------------------------------------------------------------

export const builderOutputSchema = z
  .object({
    summary: nonEmpty,
    filesChanged: z.array(nonEmpty),
    notes: z.array(nonEmpty),
    blockers: z.array(nonEmpty),
    /** Checks the builder says it ran. The engine's own `check` stage is the ground truth. */
    claimedChecks: z.array(
      z
        .object({
          command: nonEmpty,
          result: z.enum(["pass", "fail", "not-run"])
        })
        .strict()
    ),
    plainLanguage: nonEmpty
  })
  .strict();
export type BuilderOutput = z.infer<typeof builderOutputSchema>;

// --- reviewer -------------------------------------------------------------

/** Labels from REVIEW.md. `Critical` blocks the merge. */
export const SEVERITY_LABELS = ["Critical", "Consider", "Nit", "FYI"] as const;
export const severityLabelSchema = z.enum(SEVERITY_LABELS);
export type SeverityLabel = z.infer<typeof severityLabelSchema>;

export const reviewFindingSchema = z
  .object({
    severity: severityLabelSchema,
    blocking: z.boolean(),
    file: nonEmpty,
    line: z.number().int().positive(),
    section: reviewSectionSchema,
    summary: nonEmpty,
    fix: z.string()
  })
  .strict();
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const reviewerOutputSchema = z
  .object({
    verdict: z.enum(["approve", "changes-requested"]),
    findings: z.array(reviewFindingSchema),
    acceptanceStatus: z.array(
      z
        .object({
          criterion: nonEmpty,
          status: z.enum(["met", "partial", "missing"]),
          evidence: nonEmpty
        })
        .strict()
    ),
    /** One entry for each REVIEW.md heading. Use `n/a` when a heading does not apply. */
    reviewSections: z.array(
      z
        .object({
          heading: reviewSectionSchema,
          verdict: z.enum(["pass", "concerns", "n/a"]),
          notes: z.string()
        })
        .strict()
    ),
    prDraft: z.object({ title: nonEmpty, body: nonEmpty }).strict(),
    plainLanguage: nonEmpty
  })
  .strict()
  .superRefine((review, context) => {
    const seen = new Set(review.reviewSections.map((section) => section.heading));
    const missing = REVIEW_SECTIONS.filter((heading) => !seen.has(heading));
    if (missing.length > 0 || review.reviewSections.length !== REVIEW_SECTIONS.length) {
      context.addIssue({
        code: "custom",
        path: ["reviewSections"],
        message: missing.length
          ? `Missing review sections: ${missing.join(", ")}`
          : "Each review section appears exactly once"
      });
    }
    if (review.verdict === "approve" && review.findings.some((finding) => finding.blocking)) {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "An approving review has no blocking findings"
      });
    }
  });
export type ReviewerOutput = z.infer<typeof reviewerOutputSchema>;

// --- registry -------------------------------------------------------------

export const agentOutputSchemas = {
  intake: intakeOutputSchema,
  planner: plannerOutputSchema,
  builder: builderOutputSchema,
  reviewer: reviewerOutputSchema
} as const satisfies Record<AgentOutputRole, z.ZodType>;

/** JSON Schema (draft-07) for the provider flag that constrains structured output. */
export const agentOutputJsonSchema = (role: AgentOutputRole): z.core.JSONSchema.BaseSchema =>
  z.toJSONSchema(agentOutputSchemas[role], { target: "draft-7", io: "output" });
