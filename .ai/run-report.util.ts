import { z } from "zod";

export const usageSchema = z.object({
  input_tokens: z.number().nonnegative().optional(),
  cached_input_tokens: z.number().nonnegative().optional(),
  output_tokens: z.number().nonnegative().optional()
});
export const codingRunSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  workspace: z.string(),
  revision: z.string(),
  model: z.string(),
  cliVersion: z.string(),
  configurationHash: z.string(),
  boundaryChecks: z.record(z.string(), z.boolean()).optional(),
  startedAt: z.string(),
  durationMs: z.number().nonnegative(),
  exitCode: z.number().int().nullable(),
  termination: z.enum(["completed", "failed", "timeout", "cancelled", "preflight-failed"]),
  usage: usageSchema.optional(),
  commands: z.array(z.object({ status: z.string(), exitCode: z.number().int().nullable() })),
  transcript: z.string().nullable(),
  outcome: z.enum(["accepted", "rework-required", "rejected"]).nullable(),
  reviewMinutes: z.number().nonnegative().nullable(),
  note: z.string().nullable()
});
export type CodingRun = z.infer<typeof codingRunSchema>;

const modelLogSchema = z.object({
  runId: z.string(),
  provider: z.enum(["openai", "deepseek"]),
  model: z.string(),
  durationMs: z.number().nonnegative(),
  status: z.enum(["success", "failure", "cancelled"]),
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  totalTokens: z.number().nonnegative().optional()
});

export function summarizeModelLogs(lines: string[]) {
  const records = new Map<string, z.infer<typeof modelLogSchema>>();
  let ignored = 0;
  for (const line of lines.filter((entry) => entry.trim())) {
    try {
      const result = modelLogSchema.safeParse(JSON.parse(line));
      if (result.success) records.set(result.data.runId, result.data);
      else ignored += 1;
    } catch {
      ignored += 1;
    }
  }
  const events = [...records.values()];
  const durations = events.map((entry) => entry.durationMs).sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    durations.length === 0 ? null : (durations[Math.ceil(durations.length * fraction) - 1] ?? null);
  return {
    runs: events.length,
    ignored,
    outcomes: {
      success: events.filter((entry) => entry.status === "success").length,
      failure: events.filter((entry) => entry.status === "failure").length,
      cancelled: events.filter((entry) => entry.status === "cancelled").length
    },
    latencyMs: { median: percentile(0.5), p95: percentile(0.95) },
    availableTokens: {
      input: events.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0),
      output: events.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0),
      total: events.reduce((sum, entry) => sum + (entry.totalTokens ?? 0), 0)
    },
    incompleteUsageRuns: events.filter(
      (entry) =>
        entry.inputTokens === undefined ||
        entry.outputTokens === undefined ||
        entry.totalTokens === undefined
    ).length
  };
}

export function summarizeCodingRuns(runs: CodingRun[]) {
  const reviewed = runs.filter((run) => run.outcome !== null);
  return {
    runs: runs.length,
    reviewed: reviewed.length,
    unreviewed: runs.length - reviewed.length,
    accepted: reviewed.filter((run) => run.outcome === "accepted").length,
    reworkRequired: reviewed.filter((run) => run.outcome === "rework-required").length,
    rejected: reviewed.filter((run) => run.outcome === "rejected").length,
    acceptedFractionOfReviewed:
      reviewed.length === 0
        ? null
        : reviewed.filter((run) => run.outcome === "accepted").length / reviewed.length,
    timeouts: runs.filter((run) => run.termination === "timeout").length,
    reviewMinutes: reviewed.reduce((sum, run) => sum + (run.reviewMinutes ?? 0), 0),
    missingReviewMinutes: reviewed.filter((run) => run.reviewMinutes === null).length,
    missingUsage: runs.filter((run) => run.usage === undefined).length
  };
}
