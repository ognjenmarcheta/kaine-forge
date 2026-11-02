import { z } from "zod";

/**
 * The monorepo health scorecard: the JSON block of `docs/agents/monorepo-scorecard.md`, which
 * the `kaine-scorecard` skill writes and `pnpm scorecard` renders into the ledger, and the
 * view of it that `GET /api/scorecard` sends. The ledger script and the desk read one schema.
 */

/** The ten dimensions, in ledger order. A run keys its scores by position: "1" is the first. */
export const SCORECARD_DIMENSIONS = [
  "Workspace & Boundaries",
  "Build & Cache",
  "CI Topology & Speed",
  "Testing & Coverage",
  "Dependency Hygiene",
  "Release & Deploy",
  "Security Posture",
  "DX & Onboarding",
  "Docs & Agent Scaffolding",
  "AI & Agent Quality"
] as const;

export const SCORECARD_DISPOSITIONS = [
  "open",
  "fixed",
  "wontfix",
  "observed",
  "regression"
] as const;
export const scorecardDispositionSchema = z.enum(SCORECARD_DISPOSITIONS);
export type ScorecardDisposition = z.infer<typeof scorecardDispositionSchema>;

export const SCORECARD_MODES = ["fan-out", "sequential"] as const;

export const scorecardDimensionScoreSchema = z.object({
  /** `null`: the evidence could not be gathered, so the overall leaves it out. */
  score: z.number().nullable(),
  evidence: z.string(),
  calibration: z.string().optional()
});
export type ScorecardDimensionScore = z.infer<typeof scorecardDimensionScoreSchema>;

export const scorecardFindingSchema = z.object({
  slug: z.string(),
  title: z.string(),
  dimension: z.number(),
  ladderRank: z.number(),
  disposition: scorecardDispositionSchema,
  issue: z.number().optional(),
  reason: z.string().optional()
});
export type ScorecardFinding = z.infer<typeof scorecardFindingSchema>;

export const scorecardRunSchema = z.object({
  date: z.string(),
  commit: z.string(),
  mode: z.enum(SCORECARD_MODES),
  agent: z.string(),
  overall: z.number(),
  dimensions: z.record(z.string(), scorecardDimensionScoreSchema),
  findings: z.array(scorecardFindingSchema)
});
export type ScorecardRun = z.infer<typeof scorecardRunSchema>;

export const scorecardFlowSchema = z.object({
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), group: z.string().optional() })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }))
});
export type ScorecardFlow = z.infer<typeof scorecardFlowSchema>;

/** The ledger's data block. */
export const scorecardLedgerSchema = z.object({
  schema: z.number(),
  runs: z.array(scorecardRunSchema),
  authoredFlows: z.array(scorecardFlowSchema)
});
export type ScorecardLedger = z.infer<typeof scorecardLedgerSchema>;

/** A flow with every node placed: columns by dependency depth, coordinates in pixels. */
export const scorecardFlowLayoutSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    caption: z.string(),
    width: z.number(),
    height: z.number(),
    nodes: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          group: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number()
        })
        .strict()
    ),
    edges: z.array(
      z.object({ from: z.string(), to: z.string(), label: z.string().optional() }).strict()
    )
  })
  .strict();
export type ScorecardFlowLayout = z.infer<typeof scorecardFlowLayoutSchema>;

/**
 * `GET /api/scorecard`. `missing`: the checkout has no ledger. `invalid`: the ledger does not
 * parse, with the reason as raw text. `ready`: the runs oldest first, each run's calibration
 * notes by date, and the diagrams laid out.
 */
export const scorecardViewSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("missing"), ledgerPath: z.string() }).strict(),
  z.object({ state: z.literal("invalid"), ledgerPath: z.string(), detail: z.string() }).strict(),
  z
    .object({
      state: z.literal("ready"),
      ledgerPath: z.string(),
      updatedAt: z.iso.datetime({ offset: true }),
      /** `owner/name` of the origin remote on GitHub, for commit and issue links; else `null`. */
      repository: z.string().nullable(),
      runs: z.array(scorecardRunSchema),
      /**
       * The bullet lines of each run's calibration note, keyed by the run's seven-character
       * commit: two runs can share a date, never a commit.
       */
      calibration: z.record(z.string(), z.array(z.string())),
      flows: z.array(scorecardFlowLayoutSchema)
    })
    .strict()
]);
export type ScorecardView = z.infer<typeof scorecardViewSchema>;
