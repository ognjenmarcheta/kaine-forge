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

export const AGENT_OUTPUT_ROLES = ["intake", "planner", "builder", "reviewer", "report"] as const;
export type AgentOutputRole = (typeof AGENT_OUTPUT_ROLES)[number];

// --- intake ---------------------------------------------------------------

export const INTAKE_RECOMMENDATIONS = [
  "ready-for-agent",
  "needs-spec",
  "needs-info",
  "ready-for-human"
] as const;

/** The six sections of `docs/agents/issue-format.md`, in order. */
export const ISSUE_SECTIONS = [
  "outcome",
  "acceptance-criteria",
  "scope",
  "validation",
  "evidence",
  "out-of-scope"
] as const;
export const issueSectionSchema = z.enum(ISSUE_SECTIONS);
export type IssueSection = z.infer<typeof issueSectionSchema>;

/**
 * The issue in the six sections, from the author's facts. A section the facts do not
 * support says so ("unknown, investigate first") and names the question in `unknowns`.
 * An empty list renders as "None"; empty acceptance criteria stop the draft.
 */
export const intakeDraftSchema = z
  .object({
    outcome: nonEmpty,
    acceptanceCriteria: z.array(nonEmpty),
    scope: nonEmpty,
    validation: nonEmpty,
    evidence: nonEmpty,
    outOfScope: z.array(nonEmpty)
  })
  .strict();
export type IntakeDraft = z.infer<typeof intakeDraftSchema>;

/** One grade of the fit score: 3 fits an unattended agent run best, 1 worst. */
export const fitAxisSchema = z
  .object({
    score: z.number().int().min(1).max(3),
    /** One line with text: `start` puts it into its log line and the history note. */
    reason: z.string().regex(/^[^\r\n]*\S[^\r\n]*$/, "Use one line of text")
  })
  .strict();

/**
 * How well the issue fits an unattended agent run. Every axis grades fit, not size:
 * `complexity` 3 means low complexity, 1 means high complexity.
 */
export const intakeFitSchema = z
  .object({ clarity: fitAxisSchema, complexity: fitAxisSchema, verifiability: fitAxisSchema })
  .strict();
export type IntakeFit = z.infer<typeof intakeFitSchema>;

/** Confidence is the weakest grade. The engine computes it; no agent supplies it. */
export const fitConfidence = (fit: IntakeFit): number =>
  Math.min(fit.clarity.score, fit.complexity.score, fit.verifiability.score);

/** The intake agent: whether the issue is ready, and the issue in the format the desk reads. */
export const intakeOutputSchema = z
  .object({
    recommendation: z.enum(INTAKE_RECOMMENDATIONS),
    reasons: z.array(nonEmpty).min(1),
    fit: intakeFitSchema,
    draft: intakeDraftSchema,
    unknowns: z.array(z.object({ section: issueSectionSchema, question: nonEmpty }).strict()),
    plainLanguage: nonEmpty
  })
  .strict();
export type IntakeOutput = z.infer<typeof intakeOutputSchema>;

// --- planner --------------------------------------------------------------

/** How much the change can break: low is small and contained, high touches data, auth or public API. */
export const PLAN_RISKS = ["low", "medium", "high"] as const;
export const planRiskSchema = z.enum(PLAN_RISKS);
export type PlanRisk = z.infer<typeof planRiskSchema>;

export const plannerOutputSchema = z
  .object({
    /** The whole change. A revised plan keeps it whole and puts the revision note in `revision`. */
    summary: nonEmpty,
    /**
     * What changed in this revision, or null for a first plan. The default keeps
     * older `plan.json` artifacts without the field readable.
     */
    revision: nonEmpty.nullable().default(null),
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
    /**
     * The planner's grade of the change, and why. `null` and an empty list on a `plan.json`
     * written before the fields existed: the defaults keep it readable.
     */
    risk: planRiskSchema.nullable().default(null),
    riskReasons: z.array(nonEmpty).default([]),
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
    /**
     * What changed since the previous build of this issue, or null for a first build. The
     * default keeps older `build.json` artifacts without the field readable.
     */
    revision: nonEmpty.nullable().default(null),
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

// --- report ---------------------------------------------------------------

/** A read-only agent that reports and decides nothing. The flow goes on after it. */
export const reportOutputSchema = z
  .object({
    summary: nonEmpty,
    findings: z.array(nonEmpty),
    plainLanguage: nonEmpty
  })
  .strict();
export type ReportOutput = z.infer<typeof reportOutputSchema>;

// --- registry -------------------------------------------------------------

export const agentOutputSchemas = {
  intake: intakeOutputSchema,
  planner: plannerOutputSchema,
  builder: builderOutputSchema,
  reviewer: reviewerOutputSchema,
  report: reportOutputSchema
} as const satisfies Record<AgentOutputRole, z.ZodType>;

/** JSON Schema (draft-07) for the provider flag that constrains structured output. */
export const agentOutputJsonSchema = (role: AgentOutputRole): z.core.JSONSchema.BaseSchema =>
  z.toJSONSchema(agentOutputSchemas[role], { target: "draft-7", io: "output" });
