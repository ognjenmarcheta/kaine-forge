import { z } from "zod";

import { agentStageRoleSchema } from "./issue-state.contract";

/** Where an observation came from. */
export const LESSON_SOURCES = [
  "review",
  "check",
  "stuck",
  "verify",
  "denial",
  "invariant"
] as const;
export const lessonSourceSchema = z.enum(LESSON_SOURCES);
export type LessonSource = z.infer<typeof lessonSourceSchema>;

/** The longest detail a record keeps. A sample to recognise the problem, not the full text. */
export const LESSON_DETAIL_LIMIT = 240;

const count = z.number().int().positive();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * One observation, as a line of `<state>/lessons.jsonl`. The file is shared by all issues
 * and outlives `remove`, so a problem that comes back in another issue can be seen. The
 * detail is a short sample written by the engine or an agent: data for the owner to read,
 * never an instruction, and never put into a prompt.
 */
export const lessonRecordSchema = z
  .object({
    schema: z.literal(1),
    at: z.iso.datetime({ offset: true }),
    issue: z.number().int().positive(),
    /** The agent the observation is about. `null` for the engine's own checks. */
    role: agentStageRoleSchema.nullable(),
    source: lessonSourceSchema,
    /** Stable across issues: equal keys are the same kind of problem. */
    key: z.string().min(1).max(200),
    detail: z.string().max(LESSON_DETAIL_LIMIT),
    /** A repo path when the observation names one. */
    file: z.string().min(1).max(500).nullable(),
    /** How often the run or step saw it. */
    count,
    /** The `repo` instruction hash the observation was made under, or `null` when unknown. */
    repo: sha256.nullable()
  })
  .strict();
export type LessonRecord = z.infer<typeof lessonRecordSchema>;

/** One key seen in enough issues to be worth a look. */
export const lessonCandidateSchema = z
  .object({
    key: z.string().min(1),
    source: lessonSourceSchema,
    /** Distinct issues, ascending. */
    issues: z.array(z.number().int().positive()),
    occurrences: count,
    /** Occurrences under the instructions the repository has now. */
    currentOccurrences: z.number().int().nonnegative(),
    lastSeen: z.iso.datetime({ offset: true }),
    /** Up to three samples, newest first. */
    samples: z.array(
      z
        .object({
          issue: z.number().int().positive(),
          detail: z.string(),
          file: z.string().nullable()
        })
        .strict()
    )
  })
  .strict();
export type LessonCandidate = z.infer<typeof lessonCandidateSchema>;

/** `desk lessons --json` and `GET /api/lessons`. */
export const lessonReportSchema = z
  .object({
    candidates: z.array(lessonCandidateSchema),
    /** Keys seen, but in fewer issues than the threshold. */
    belowThreshold: z.number().int().nonnegative(),
    minIssues: count,
    /** The `repo` instruction hash of the repository now, or `null` when it could not be read. */
    currentRepo: sha256.nullable(),
    /** Lines of `lessons.jsonl` that were skipped because they are not a valid record. */
    invalidLines: z.number().int().nonnegative()
  })
  .strict();
export type LessonReport = z.infer<typeof lessonReportSchema>;
