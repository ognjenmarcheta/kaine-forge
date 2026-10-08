import { z } from "zod";

/**
 * What a browser UI reads from engine files that the issue detail does not
 * carry: `check-report.json` (the tail of each step), `ship-plan.json` (the
 * dry run of the ship step), and `review.json` (the acceptance status). These are the fields the UI shows, nothing
 * more. They are not strict, so a field the engine adds later does not break
 * the page. A test in this package keeps them compatible with the engine
 * schemas (`checkReportSchema`, `shipPlanSchema`, `reviewArtifactSchema`), which stay the source of
 * truth for the files.
 */

export const checkReportViewSchema = z.object({
  passed: z.boolean(),
  kind: z.enum(["loop", "ship"]),
  steps: z.array(
    z.object({
      argv: z.array(z.string()),
      code: z.number().int().nullable(),
      timedOut: z.boolean(),
      /** Last lines of stdout and stderr, colour removed and size bounded. */
      tail: z.string(),
      durationMs: z.number().int().nonnegative()
    })
  ),
  generatedDrift: z.boolean()
});
export type CheckReportView = z.infer<typeof checkReportViewSchema>;

export const shipPlanViewSchema = z.object({
  dryRun: z.boolean(),
  branch: z.string().nullable(),
  gate: z.object({
    ok: z.boolean(),
    failures: z.array(z.object({ kind: z.string(), message: z.string() }))
  }),
  changeset: z.object({
    kind: z.enum(["none", "file", "skip-label", "invalid"]),
    reason: z.string()
  }),
  changesetText: z.string().nullable(),
  commitHeader: z.string(),
  pullRequest: z.object({ title: z.string() }),
  files: z.array(z.string()),
  unfilledHeadings: z.array(z.string())
});
export type ShipPlanView = z.infer<typeof shipPlanViewSchema>;

/** The reviewer's verdict on each acceptance criterion. The detail carries the findings, not this. */
export const reviewArtifactViewSchema = z.object({
  review: z.object({
    acceptanceStatus: z.array(
      z.object({
        criterion: z.string(),
        status: z.enum(["met", "partial", "missing"]),
        evidence: z.string()
      })
    )
  })
});
export type ReviewArtifactView = z.infer<typeof reviewArtifactViewSchema>;
