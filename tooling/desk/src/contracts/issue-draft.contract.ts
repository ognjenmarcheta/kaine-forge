import { z } from "zod";

import { INTAKE_RECOMMENDATIONS, issueSectionSchema } from "./agent-output.contract";
import { providerSchema } from "./desk-config.contract";

const count = z.number().int().nonnegative();

/**
 * `artifacts/issue-draft.json`: the issue of a stopped intake, redrafted in the format of
 * `docs/agents/issue-format.md`. The engine rendered `body`; the intake agent supplied the
 * sections. Nothing reaches GitHub until the owner applies it.
 */
export const issueDraftSchema = z
  .object({
    schema: z.literal(1),
    issue: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    /** SHA-256 of the body the draft started from. Apply refuses when GitHub has another. */
    originalBodyHash: z.string().regex(/^[0-9a-f]{64}$/),
    /** The full new body: the six sections, then the old body as a quote. */
    body: z.string().min(1),
    contract: z.object({ found: count, total: count }).strict(),
    acceptanceCriteria: count,
    recommendation: z.enum(INTAKE_RECOMMENDATIONS),
    reasons: z.array(z.string().min(1)),
    /** Sections the facts did not support, with the question that would settle each. */
    unknowns: z.array(
      z.object({ section: issueSectionSchema, question: z.string().min(1) }).strict()
    ),
    plainLanguage: z.string().min(1),
    provider: providerSchema,
    model: z.string().min(1).nullable()
  })
  .strict();
export type IssueDraft = z.infer<typeof issueDraftSchema>;
