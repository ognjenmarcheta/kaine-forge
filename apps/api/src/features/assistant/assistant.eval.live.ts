import { createLogger } from "@repo/logger";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { z } from "zod";

// A fresh database binding for each case; neither production singleton is reachable.
const holder = vi.hoisted((): { database: ReturnType<typeof createEvalDatabase> | null } => ({
  database: null
}));
vi.mock("@repo/db", async () => ({
  ...(await import("@repo/db/schema")),
  get db() {
    if (!holder.database) throw new Error("Evaluation database not initialized");
    return holder.database.db;
  }
}));
vi.mock("@repo/db/client", () => {
  throw new Error("Real PostgreSQL access is forbidden in evaluations");
});
vi.mock("pg", () => {
  throw new Error("Real PostgreSQL access is forbidden in evaluations");
});

import { ASSISTANT_SYSTEM_PROMPT, createAssistantAiRuntime } from "./assistant.ai-runtime";
import { assistantEvalCases } from "./assistant.eval.data";
import { createEvalDatabase, seedEvalFixture } from "./assistant.eval.fixture";
import { EVAL_LIMITS, evalOptionsSchema } from "./assistant.eval.options";
import {
  digest,
  newEvalResultId,
  writeEvalReport,
  type EvalReport,
  type EvalResult
} from "./assistant.eval.report";
import { scoreAssistantEval, substituteFixture, type EvalAction } from "./assistant.eval.scoring";
import type { ModelUsage } from "../../ai.telemetry";
import { createApiWorkflows } from "../../context.workflows";

it("executes the explicitly requested synthetic evaluation run", async () => {
  const options = evalOptionsSchema.parse(JSON.parse(process.env["KAINE_EVAL_OPTIONS"] ?? "{}"));
  if (!options.live || !options.provider || !options.model)
    throw new Error("Use pnpm eval:assistant --live --provider ... --model ...");
  const reportPath = z.string().min(1).parse(process.env["KAINE_EVAL_REPORT"]);
  const report: EvalReport = {
    schemaVersion: 1,
    runId: randomUUID(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    datasetHash: digest(JSON.stringify(assistantEvalCases)),
    promptHash: digest(ASSISTANT_SYSTEM_PROMPT),
    provider: options.provider,
    model: options.model,
    startedAt: new Date().toISOString(),
    limits: { ...EVAL_LIMITS, repeat: options.repeat },
    scheduled: options.cases.length * options.repeat,
    complete: false,
    results: [],
    reviews: []
  };
  writeEvalReport(reportPath, report);
  const deadline = Date.now() + EVAL_LIMITS.runMs;
  for (const id of options.cases) {
    const evaluation = assistantEvalCases.find((entry) => entry.id === id);
    if (!evaluation) throw new Error("Unknown case");
    for (let repetition = 1; repetition <= options.repeat; repetition += 1) {
      if (Date.now() >= deadline) throw new Error("Evaluation run deadline reached");
      holder.database = createEvalDatabase();
      try {
        const fixture = await seedEvalFixture(holder.database, evaluation);
        const startedAt = Date.now();
        const prompt = substituteFixture(evaluation.prompt, fixture.ids);
        const actions: EvalAction[] = [];
        const current: EvalResult = {
          id: newEvalResultId(),
          caseId: id,
          repetition,
          prompt,
          reply: "",
          durationMs: 0,
          actions,
          mechanical: "fail",
          checks: [{ name: "completed", passed: false }],
          reviewFlags: [],
          error: "incomplete",
          usage: {},
          before: z.json().parse(JSON.parse(JSON.stringify(fixture.before))),
          after: null
        };
        report.results.push(current);
        writeEvalReport(reportPath, report);
        const recordAction = (action: EvalAction) => {
          const index = actions.findIndex((existing) => existing.id === action.id);
          if (index < 0) actions.push(action);
          else actions[index] = action;
          current.durationMs = Date.now() - startedAt;
          writeEvalReport(reportPath, report);
        };
        let usage: ModelUsage = {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined
        };
        const runtime = createAssistantAiRuntime({
          workflows: createApiWorkflows({
            logger: createLogger({ name: "assistant-eval", level: "silent" }),
            publish: () => {}
          }),
          publishAssistantDelta: () => {},
          recordModelCall: (event) => {
            usage = {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              totalTokens: event.totalTokens
            };
          },
          observeToolStart: (event) =>
            recordAction({
              id: event.toolCall.toolCallId,
              tool: event.toolCall.toolName,
              status: "attempted",
              input: z.record(z.string(), z.json()).parse(event.toolCall.input),
              output: null
            }),
          observeToolEnd: (event) =>
            recordAction({
              id: event.toolCall.toolCallId,
              tool: event.toolCall.toolName,
              status: event.toolOutput.type === "tool-error" ? "failed" : "successful",
              input: z.record(z.string(), z.json()).parse(event.toolCall.input),
              output:
                event.toolOutput.type === "tool-error"
                  ? null
                  : z.json().parse(event.toolOutput.output)
            }),
          observeStep: (step) => {
            for (const call of step.toolCalls) {
              if (call.invalid)
                recordAction({
                  id: call.toolCallId,
                  tool: call.toolName,
                  status: "rejected",
                  input: z.record(z.string(), z.json()).safeParse(call.input).data ?? {},
                  output: null
                });
            }
          }
        });
        const signal = AbortSignal.timeout(
          Math.max(1, Math.min(EVAL_LIMITS.caseMs, deadline - startedAt))
        );
        let reply = "";
        let error: string | null = null;
        try {
          const result = await runtime.runAgent({
            conversationId: randomUUID(),
            messages: [{ role: "user", content: prompt }],
            scope: fixture.scope,
            execution: {
              abortSignal: signal,
              maxOutputTokens: EVAL_LIMITS.outputTokens,
              maxRetries: 0
            }
          });
          reply = result.reply;
        } catch {
          // Provider exceptions may embed credentials or request headers. Retain categories only.
          error = signal.aborted ? "timeout" : "model-or-tool-failure";
        }
        const inspected = await fixture.inspect();
        const score = scoreAssistantEval({
          evaluation,
          actions,
          state: inspected.state,
          ids: fixture.ids,
          protectedRowsUnchanged: inspected.protectedRowsUnchanged,
          reply,
          completed: error === null
        });
        Object.assign(current, {
          reply,
          durationMs: Date.now() - startedAt,
          ...score,
          error,
          usage,
          after: z.json().parse(JSON.parse(JSON.stringify(inspected.after)))
        });
        writeEvalReport(reportPath, report);
      } finally {
        await holder.database.client.close();
        holder.database = null;
      }
    }
  }
  report.complete = true;
  writeEvalReport(reportPath, report);
  // Prove the persisted report is readable before returning a successful exit.
  expect(JSON.parse(readFileSync(path.resolve(reportPath), "utf8"))).toHaveProperty(
    "complete",
    true
  );
  expect(
    report.results.filter((result) => result.mechanical === "fail").map((result) => result.caseId)
  ).toEqual([]);
});
