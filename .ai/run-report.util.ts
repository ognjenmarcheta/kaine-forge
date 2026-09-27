import { z } from "zod";

export const usageSchema = z.object({
  input_tokens: z.number().nonnegative().optional(),
  cached_input_tokens: z.number().nonnegative().optional(),
  output_tokens: z.number().nonnegative().optional()
});
export const codingRunSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  harness: z.enum(["codex", "claude"]).optional(),
  caseId: z.string().optional(),
  reasoning: z.string().optional(),
  instructionHash: z.string().optional(),
  toolHash: z.string().optional(),
  mode: z.enum(["read", "edit"]).optional(),
  effectiveConfig: z.array(z.string()).optional(),
  observedConfig: z.record(z.string(), z.json()).optional(),
  networkEvidence: z.enum(["denied", "allowed", "inconclusive"]).optional(),
  failure: z.string().optional(),
  isolation: z.record(z.string(), z.json()).optional(),
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
      input: events.some((entry) => entry.inputTokens !== undefined)
        ? events.reduce((sum, entry) => sum + (entry.inputTokens ?? 0), 0)
        : null,
      output: events.some((entry) => entry.outputTokens !== undefined)
        ? events.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0)
        : null,
      total: events.some((entry) => entry.totalTokens !== undefined)
        ? events.reduce((sum, entry) => sum + (entry.totalTokens ?? 0), 0)
        : null
    },
    incompleteUsageRuns: events.filter(
      (entry) =>
        entry.inputTokens === undefined ||
        entry.outputTokens === undefined ||
        entry.totalTokens === undefined
    ).length
  };
}

function summarizeCodingGroup(runs: CodingRun[]) {
  const reviewed = runs.filter((run) => run.outcome !== null);
  const accepted = reviewed.filter((run) => run.outcome === "accepted");
  const durations = runs.map((run) => run.durationMs).sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    durations.length ? (durations[Math.ceil(durations.length * fraction) - 1] ?? null) : null;
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
    incomplete: runs.filter((run) => run.termination !== "completed").length,
    executionMs: { median: percentile(0.5), p95: percentile(0.95) },
    tokensPerAccepted: {
      input:
        accepted.length && accepted.every((run) => run.usage?.input_tokens !== undefined)
          ? accepted.reduce((sum, run) => sum + (run.usage?.input_tokens ?? 0), 0) / accepted.length
          : null,
      output:
        accepted.length && accepted.every((run) => run.usage?.output_tokens !== undefined)
          ? accepted.reduce((sum, run) => sum + (run.usage?.output_tokens ?? 0), 0) /
            accepted.length
          : null
    },
    availableTokens: {
      input: runs.some((run) => run.usage?.input_tokens !== undefined)
        ? runs.reduce((sum, run) => sum + (run.usage?.input_tokens ?? 0), 0)
        : null,
      output: runs.some((run) => run.usage?.output_tokens !== undefined)
        ? runs.reduce((sum, run) => sum + (run.usage?.output_tokens ?? 0), 0)
        : null
    },
    missingInputTokens: runs.filter((run) => run.usage?.input_tokens === undefined).length,
    missingOutputTokens: runs.filter((run) => run.usage?.output_tokens === undefined).length,
    timeouts: runs.filter((run) => run.termination === "timeout").length,
    reviewMinutes: reviewed.some((run) => run.reviewMinutes !== null)
      ? reviewed.reduce((sum, run) => sum + (run.reviewMinutes ?? 0), 0)
      : null,
    missingReviewMinutes: reviewed.filter((run) => run.reviewMinutes === null).length,
    missingUsage: runs.filter((run) => run.usage === undefined).length
  };
}

export function summarizeCodingRuns(runs: CodingRun[]) {
  const unique = [...new Map(runs.map((run) => [run.runId, run])).values()];
  const groups = new Map<string, CodingRun[]>();
  let excludedFromComparisons = 0;
  for (const run of unique) {
    if (!run.harness || !run.caseId || !run.instructionHash || !run.toolHash || !run.mode) {
      excludedFromComparisons++;
      continue;
    }
    const key = JSON.stringify(comparisonConfiguration(run));
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return {
    ...summarizeCodingGroup(unique),
    excludedFromComparisons,
    groups: [...groups.values()].map((entries) => ({
      configuration: entries[0] ? comparisonConfiguration(entries[0]) : null,
      ...summarizeCodingGroup(entries)
    }))
  };
}

function comparisonConfiguration(run: CodingRun) {
  return {
    harness: run.harness,
    caseId: run.caseId,
    model: run.model,
    cliVersion: run.cliVersion,
    reasoning: run.reasoning ?? null,
    revision: run.revision,
    mode: run.mode,
    configurationHash: run.configurationHash,
    instructionHash: run.instructionHash,
    toolHash: run.toolHash
  };
}
