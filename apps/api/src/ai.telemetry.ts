import { randomUUID } from "node:crypto";

export interface ModelUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

export interface ModelRunTelemetry extends ModelUsage {
  runId: string;
  provider: "openai" | "deepseek";
  model: string;
  durationMs: number;
  steps: number;
  toolCalls: number;
  status: "success" | "failure" | "cancelled";
  failureCategory: "provider" | "timeout" | "aborted" | null;
}

export function modelFailureCategory(error: unknown): "provider" | "timeout" | "aborted" {
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  return "provider";
}

/** Completed steps are retained on failure; missing provider usage is never reported as zero. */
export function startModelRun(
  config: { provider: "openai" | "deepseek"; model: string },
  record: (event: ModelRunTelemetry) => void
) {
  const runId = randomUUID();
  const startedAt = Date.now();
  let finished = false;
  let steps = 0;
  let toolCalls = 0;
  let usage: ModelUsage = {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined
  };

  return {
    step(next: ModelUsage, calls: number) {
      const add = (previous: number | undefined, value: number | undefined) =>
        value === undefined || (steps > 0 && previous === undefined)
          ? undefined
          : (previous ?? 0) + value;
      usage = {
        inputTokens: add(usage.inputTokens, next.inputTokens),
        outputTokens: add(usage.outputTokens, next.outputTokens),
        totalTokens: add(usage.totalTokens, next.totalTokens)
      };
      steps += 1;
      toolCalls += calls;
    },
    finish(
      failureCategory: ModelRunTelemetry["failureCategory"],
      complete?: { usage: ModelUsage; steps: number; toolCalls: number }
    ) {
      if (finished) return;
      finished = true;
      const finalUsage = steps > 0 ? usage : (complete?.usage ?? usage);
      record({
        runId,
        provider: config.provider,
        model: config.model,
        durationMs: Date.now() - startedAt,
        inputTokens: finalUsage.inputTokens,
        outputTokens: finalUsage.outputTokens,
        totalTokens: finalUsage.totalTokens,
        steps: complete?.steps ?? steps,
        toolCalls: complete?.toolCalls ?? toolCalls,
        status:
          failureCategory === null
            ? "success"
            : failureCategory === "provider"
              ? "failure"
              : "cancelled",
        failureCategory
      });
    }
  };
}
