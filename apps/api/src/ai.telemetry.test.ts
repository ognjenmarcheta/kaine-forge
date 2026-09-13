import { describe, expect, it, vi } from "vitest";

import { modelFailureCategory, startModelRun } from "./ai.telemetry";

describe("model run terminal telemetry", () => {
  it("does not replace missing step usage with an incomplete SDK sum or copy extra fields", () => {
    const record = vi.fn();
    const config = { provider: "openai" as const, model: "test", apiKey: "synthetic-secret" };
    const run = startModelRun(config, record);
    run.step({ inputTokens: undefined, outputTokens: 2, totalTokens: undefined }, 0);
    run.step({ inputTokens: 10, outputTokens: 3, totalTokens: 13 }, 0);
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      payload: "synthetic-secret"
    };
    run.finish(null, { usage, steps: 2, toolCalls: 0 });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: undefined, outputTokens: 5, totalTokens: undefined })
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain("synthetic-secret");
  });
  it("sums completed steps and emits only once when failure and cleanup both finish", () => {
    const record = vi.fn();
    const run = startModelRun({ provider: "openai", model: "test" }, record);
    run.step({ inputTokens: 10, outputTokens: 3, totalTokens: 13 }, 2);
    run.step({ inputTokens: 15, outputTokens: 4, totalTokens: 19 }, 1);
    run.finish("provider");
    run.finish(null);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 25,
        outputTokens: 7,
        totalTokens: 32,
        steps: 2,
        toolCalls: 3,
        status: "failure"
      })
    );
  });
  it("retains unavailable counts and emits safe cancellation metadata", () => {
    const record = vi.fn();
    const run = startModelRun({ provider: "deepseek", model: "test" }, record);
    run.step({ inputTokens: undefined, outputTokens: 2, totalTokens: undefined }, 0);
    run.step({ inputTokens: 10, outputTokens: 3, totalTokens: 13 }, 0);
    run.finish("timeout");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: undefined,
        outputTokens: 5,
        totalTokens: undefined,
        status: "cancelled",
        failureCategory: "timeout"
      })
    );
    expect(modelFailureCategory(new DOMException("secret payload", "AbortError"))).toBe("aborted");
    expect(modelFailureCategory({ token: "secret" })).toBe("provider");
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret");
  });
});
