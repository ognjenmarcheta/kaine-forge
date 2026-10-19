import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { currentReview, evalReportStatus, type EvalReport } from "./assistant.eval.report";

/**
 * The committed record of reviewed live runs.
 *
 * Reports stay local because they hold prompts, replies and rows. The ledger
 * keeps only what a reviewer needs to compare runs: who ran which model, on
 * which commit, against which dataset, and how many results passed. `.strict()`
 * keeps it that way — a run carrying any other field does not parse.
 */
export const EVAL_LEDGER_PATH = path.join(import.meta.dirname, "assistant.eval.ledger.json");

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const count = z.number().int().nonnegative();

const ledgerRunSchema = z
  .object({
    runId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revision: z.string().regex(/^[0-9a-f]{40}$/),
    provider: z.enum(["openai", "deepseek"]),
    model: z.string().min(1),
    datasetHash: sha256,
    promptHash: sha256,
    scheduled: z.number().int().positive(),
    mechanicalPassed: count,
    reviewPassed: count,
    passed: count
  })
  .strict();
export type EvalLedgerRun = z.infer<typeof ledgerRunSchema>;

const ledgerSchema = z
  .object({ schemaVersion: z.literal(1), runs: z.array(ledgerRunSchema) })
  .strict();
export type EvalLedger = z.infer<typeof ledgerSchema>;

export const parseEvalLedger = (raw: string): EvalLedger => ledgerSchema.parse(JSON.parse(raw));

export const readEvalLedger = (file = EVAL_LEDGER_PATH): EvalLedger =>
  parseEvalLedger(readFileSync(file, "utf8"));

export function writeEvalLedger(ledger: EvalLedger, file = EVAL_LEDGER_PATH): void {
  writeFileSync(file, `${JSON.stringify(ledgerSchema.parse(ledger), null, 2)}\n`);
}

/** A run can be recorded only once it is complete and every result carries a current review. */
export function summarizeEvalReport(report: EvalReport): EvalLedgerRun {
  if (evalReportStatus(report) === "incomplete")
    throw new Error("Only a complete run can be recorded");
  let mechanicalPassed = 0;
  let reviewPassed = 0;
  let passed = 0;
  for (const result of report.results) {
    const review = currentReview(report, result);
    if (!review) throw new Error(`Review result ${result.id} before recording the run`);
    const mechanical = result.mechanical === "pass";
    const human = review.truthful === "pass" && review.quality === "pass";
    if (mechanical) mechanicalPassed += 1;
    if (human) reviewPassed += 1;
    if (mechanical && human) passed += 1;
  }
  return ledgerRunSchema.parse({
    runId: report.runId,
    date: report.startedAt.slice(0, 10),
    revision: report.revision,
    provider: report.provider,
    model: report.model,
    datasetHash: report.datasetHash,
    promptHash: report.promptHash,
    scheduled: report.scheduled,
    mechanicalPassed,
    reviewPassed,
    passed
  });
}

/**
 * Within one provider, model and dataset, the pass rate never falls from one
 * recorded run to the next. A changed dataset or model starts a new series,
 * because its scores are not comparable; a changed system prompt does not,
 * because that is the change this gate exists to catch.
 */
export function findEvalRegressions(runs: readonly EvalLedgerRun[]): string[] {
  const previous = new Map<string, EvalLedgerRun>();
  const regressions: string[] = [];
  for (const run of runs) {
    const series = `${run.provider}/${run.model}@${run.datasetHash.slice(0, 12)}`;
    const before = previous.get(series);
    // Cross-multiplied so runs with different repetition counts compare exactly.
    if (before && run.passed * before.scheduled < before.passed * run.scheduled)
      regressions.push(
        `${series}: run ${run.runId} passed ${run.passed}/${run.scheduled}, ` +
          `below ${before.passed}/${before.scheduled} from run ${before.runId}`
      );
    previous.set(series, run);
  }
  return regressions;
}

export function appendEvalLedgerRun(ledger: EvalLedger, run: EvalLedgerRun): EvalLedger {
  if (ledger.runs.some((entry) => entry.runId === run.runId))
    throw new Error(`Run ${run.runId} is already recorded`);
  const next = { ...ledger, runs: [...ledger.runs, run] };
  const regressions = findEvalRegressions(next.runs);
  if (regressions.length > 0) throw new Error(`Not recorded: ${regressions.join("; ")}`);
  return next;
}
