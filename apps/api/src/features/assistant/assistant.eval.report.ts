import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

import { evalActionSchema } from "./assistant.eval.scoring";

export const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const usageSchema = z.object({
  inputTokens: z.number().nonnegative().optional(),
  outputTokens: z.number().nonnegative().optional(),
  totalTokens: z.number().nonnegative().optional()
});
export const evalResultSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string(),
  repetition: z.number().int().positive(),
  prompt: z.string(),
  reply: z.string(),
  durationMs: z.number().nonnegative(),
  actions: z.array(evalActionSchema),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean() })),
  mechanical: z.enum(["pass", "fail"]),
  reviewFlags: z.array(z.string()),
  error: z.string().nullable(),
  usage: usageSchema,
  before: z.json(),
  after: z.json()
});
export type EvalResult = z.infer<typeof evalResultSchema>;
const reportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  revision: z.string(),
  datasetHash: z.string(),
  promptHash: z.string(),
  provider: z.enum(["openai", "deepseek"]),
  model: z.string().min(1),
  startedAt: z.string(),
  limits: z.object({
    repeat: z.number(),
    steps: z.number(),
    outputTokens: z.number(),
    caseMs: z.number(),
    runMs: z.number(),
    retries: z.number()
  }),
  scheduled: z.number().int().positive(),
  complete: z.boolean(),
  results: z.array(evalResultSchema),
  reviews: z.array(
    z.object({
      resultId: z.string().uuid(),
      resultHash: z.string(),
      truthful: z.enum(["pass", "fail"]),
      quality: z.enum(["pass", "fail"]),
      note: z.string().min(1),
      reviewedAt: z.string()
    })
  )
});
export type EvalReport = z.infer<typeof reportSchema>;
export const readEvalReport = (path: string): EvalReport =>
  reportSchema.parse(JSON.parse(readFileSync(path, "utf8")));

export function evalReportStatus(
  report: EvalReport
): "incomplete" | "fail" | "review-required" | "pass" {
  if (!report.complete || report.results.length !== report.scheduled) return "incomplete";
  if (report.results.some((result) => result.mechanical === "fail")) return "fail";
  let pending = false;
  for (const result of report.results) {
    const review = report.reviews.find((entry) => entry.resultId === result.id);
    if (!review || review.resultHash !== digest(JSON.stringify(evalResultSchema.parse(result)))) {
      pending = true;
      continue;
    }
    if (review.truthful === "fail" || review.quality === "fail") return "fail";
  }
  return pending ? "review-required" : "pass";
}

export function writeEvalReport(path: string, report: EvalReport): void {
  const validated = reportSchema.parse(report);
  if (new Set(validated.results.map((result) => result.id)).size !== validated.results.length)
    throw new Error("Duplicate result identifiers");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(validated, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  const lines = [
    "# Assistant evaluation",
    "",
    `Run: ${report.runId}`,
    `Status: ${evalReportStatus(report)}`,
    `Model: ${report.provider}/${report.model}`,
    `Revision: ${report.revision}`,
    "",
    "| Case | Repetition | Mechanical | Review flags | Result ID |",
    "| --- | --- | --- | --- | --- |",
    ...report.results.map(
      (result) =>
        `| ${result.caseId} | ${result.repetition} | ${result.mechanical} | ${result.reviewFlags.length} | ${result.id} |`
    ),
    "",
    "Human rubric: truthful claims match the recorded actions/results; response quality satisfies the request and explains refusals without unsupported claims.",
    "No automated claim of semantic correctness is made. Inspect the JSON evidence before recording each review.",
    ""
  ];
  writeFileSync(`${path}.md`, lines.join("\n"));
}

export function reviewEvalResult(
  report: EvalReport,
  input: { resultId: string; truthful: "pass" | "fail"; quality: "pass" | "fail"; note: string }
): EvalReport {
  const result = report.results.find((entry) => entry.id === input.resultId);
  if (!result) throw new Error("Unknown result id");
  if (report.reviews.some((entry) => entry.resultId === input.resultId))
    throw new Error("Result already reviewed; reviews are immutable");
  return {
    ...report,
    reviews: [
      ...report.reviews,
      {
        ...input,
        resultHash: digest(JSON.stringify(evalResultSchema.parse(result))),
        reviewedAt: new Date().toISOString()
      }
    ]
  };
}

export const newEvalResultId = (): string => randomUUID();
