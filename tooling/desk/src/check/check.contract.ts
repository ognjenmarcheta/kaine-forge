import { z } from "zod";

import { commandSchema } from "../contracts";

export const CHECK_KINDS = ["loop", "ship"] as const;
export const checkKindSchema = z.enum(CHECK_KINDS);
export type CheckKind = z.infer<typeof checkKindSchema>;

const timestampSchema = z.iso.datetime({ offset: true });

export const checkStepReportSchema = z
  .object({
    argv: commandSchema,
    /** `null` when the step timed out or never started. */
    code: z.number().int().nullable(),
    timedOut: z.boolean(),
    /** Last lines of stdout and stderr, colour removed and size bounded. */
    tail: z.string(),
    durationMs: z.number().int().nonnegative()
  })
  .strict();
export type CheckStepReport = z.infer<typeof checkStepReportSchema>;

/** `check-report.json`: the engine's own verdict. Agent claims never replace it. */
export const checkReportSchema = z
  .object({
    passed: z.boolean(),
    kind: checkKindSchema,
    steps: z.array(checkStepReportSchema),
    /** Stable id of the failure, `null` when the checks passed. Equal ids mean the same failure. */
    fingerprint: z.string().min(1).nullable(),
    /** sha256 of the worktree diff after the checks ran. Ship compares it with the current diff. */
    diffHash: z.string().regex(/^[0-9a-f]{64}$/),
    /** True when `pnpm generate` changed the tree. */
    generatedDrift: z.boolean(),
    startedAt: timestampSchema,
    finishedAt: timestampSchema
  })
  .strict();
export type CheckReport = z.infer<typeof checkReportSchema>;
