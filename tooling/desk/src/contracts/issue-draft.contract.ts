import { z } from "zod";

import {
  INTAKE_RECOMMENDATIONS,
  intakeFitSchema,
  issueSectionSchema
} from "./agent-output.contract";
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
    /** The intake agent's fit score. Drafts written before the score existed have none. */
    fit: intakeFitSchema.optional(),
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

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * `artifacts/intake-fit.json`: the fit score of the latest draft. It outlives the draft, so
 * `start` can warn about a low score. It holds for the issue body it was scored on: the body
 * the draft started from, or the drafted body once applied.
 */
export const intakeFitRecordSchema = z
  .object({
    schema: z.literal(1),
    issue: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    originalBodyHash: sha256,
    draftBodyHash: sha256,
    fit: intakeFitSchema
  })
  .strict();
export type IntakeFitRecord = z.infer<typeof intakeFitRecordSchema>;
