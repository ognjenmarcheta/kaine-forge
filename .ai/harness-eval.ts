#!/usr/bin/env tsx

// Renders the harness-eval ledger's generated region from its data block.
// Deterministic arithmetic only: the verdicts are recorded by a human running
// kaine-harness-eval, and nothing here executes a trial or calls a model.
//
// Modelled on scorecard-render.ts, and human-invoked for the same reason: this
// measures judgment, so it must never gate a PR.

import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./ai.util";
import { extractRegion, replaceRegion } from "./scorecard.util";

export const LEDGER_PATH = join(REPO_ROOT, "docs", "agents", "harness-evals.md");
export const DATA_MARKER = "harness-eval:data";
export const GENERATED_MARKER = "harness-eval:generated";

export const ARMS = ["with", "without"] as const;
export const CONCLUSIONS = ["effect", "no-effect", "inconclusive"] as const;
export const ACTIONS = ["keep", "tighten", "delete", "promote-to-lint"] as const;

export type Arm = (typeof ARMS)[number];

export interface EvalTrial {
  arm: Arm;
  verdict: number;
  transcript: string;
  metrics: Record<string, number>;
}

export interface EvalRun {
  date: string;
  commit: string;
  model: string;
  agent: string;
  rule: string;
  conclusion: (typeof CONCLUSIONS)[number];
  action: (typeof ACTIONS)[number];
  trials: EvalTrial[];
}

export interface LedgerData {
  runs: EvalRun[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`harness-eval:data: ${field} must be a non-empty string`);
  }
  return value;
};

const requireMember = <TMember extends string>(
  value: unknown,
  allowed: readonly TMember[],
  field: string
): TMember => {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) {
    throw new Error(`harness-eval:data: ${field} must be one of ${allowed.join(", ")}`);
  }
  return match;
};

const parseMetrics = (value: unknown, path: string): Record<string, number> => {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path}.metrics must be an object`);
  }

  const metrics: Record<string, number> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new Error(`harness-eval:data: ${path}.metrics.${name} must be a finite number`);
    }
    metrics[name] = raw;
  }
  return metrics;
};

const parseTrial = (value: unknown, path: string): EvalTrial => {
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path} must be an object`);
  }
  const verdict = value["verdict"];
  if (typeof verdict !== "number" || verdict < 1 || verdict > 5) {
    throw new Error(`harness-eval:data: ${path}.verdict must be a number from 1 to 5`);
  }

  return {
    arm: requireMember(value["arm"], ARMS, `${path}.arm`),
    verdict,
    transcript: requireString(value["transcript"], `${path}.transcript`),
    metrics: parseMetrics(value["metrics"], path)
  };
};

const parseRun = (value: unknown, index: number): EvalRun => {
  const path = `runs[${String(index)}]`;
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path} must be an object`);
  }
  const trials = value["trials"];
  if (!Array.isArray(trials) || trials.length === 0) {
    throw new Error(`harness-eval:data: ${path}.trials must be a non-empty array`);
  }

  return {
    date: requireString(value["date"], `${path}.date`),
    commit: requireString(value["commit"], `${path}.commit`),
    model: requireString(value["model"], `${path}.model`),
    agent: requireString(value["agent"], `${path}.agent`),
    rule: requireString(value["rule"], `${path}.rule`),
    conclusion: requireMember(value["conclusion"], CONCLUSIONS, `${path}.conclusion`),
    action: requireMember(value["action"], ACTIONS, `${path}.action`),
    trials: trials.map((trial, trialIndex) =>
      parseTrial(trial, `${path}.trials[${String(trialIndex)}]`)
    )
  };
};

export const parseLedger = (raw: string): LedgerData => {
  // The region arrives with its blank-line padding, so trim before unwrapping
  // the fence rather than after.
  const body = extractRegion(raw, DATA_MARKER)
    .trim()
    .replace(/^```json/, "")
    .replace(/```$/, "")
    .trim();
  const parsed: unknown = JSON.parse(body === "" ? "{}" : body);

  if (!isRecord(parsed) || parsed["runs"] === undefined) {
    return { runs: [] };
  }
  if (!Array.isArray(parsed["runs"])) {
    throw new Error("harness-eval:data: runs must be an array");
  }

  return { runs: parsed["runs"].map(parseRun) };
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const format = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const signed = (value: number): string => (value > 0 ? `+${format(value)}` : format(value));

export const armVerdicts = (run: EvalRun, arm: Arm): number[] =>
  run.trials.filter((trial) => trial.arm === arm).map((trial) => trial.verdict);

/** Metric names appearing in either arm, so a missing metric reads as absent. */
export const metricNames = (run: EvalRun): string[] =>
  [...new Set(run.trials.flatMap((trial) => Object.keys(trial.metrics)))].sort();

export const armMetric = (run: EvalRun, arm: Arm, metric: string): number =>
  mean(
    run.trials
      .filter((trial) => trial.arm === arm)
      .flatMap((trial) => (metric in trial.metrics ? [trial.metrics[metric] ?? 0] : []))
  );

export const renderLedgerMarkdown = (data: LedgerData): string => {
  if (data.runs.length === 0) {
    return "_No runs recorded yet. Run the `kaine-harness-eval` skill, then `pnpm harness:eval`._";
  }

  const sections = data.runs.map((run) => {
    const withMean = mean(armVerdicts(run, "with"));
    const withoutMean = mean(armVerdicts(run, "without"));
    const rows = metricNames(run).map((metric) => {
      const on = armMetric(run, "with", metric);
      const off = armMetric(run, "without", metric);
      return `| ${metric} | ${format(on)} | ${format(off)} | ${signed(on - off)} |`;
    });

    return [
      `### ${run.date} · \`${run.rule}\``,
      "",
      `Commit \`${run.commit}\` · ${run.model} via ${run.agent} · ` +
        `${String(armVerdicts(run, "with").length)} with / ${String(armVerdicts(run, "without").length)} without`,
      "",
      `**Conclusion:** ${run.conclusion} · **Action:** ${run.action}`,
      "",
      `Verdict mean: ${format(withMean)} with, ${format(withoutMean)} without ` +
        `(${signed(withMean - withoutMean)}).`,
      ...(rows.length > 0
        ? [
            "",
            "| Metric | With rule | Without rule | Delta |",
            "| --- | --- | --- | --- |",
            ...rows
          ]
        : [])
    ].join("\n");
  });

  const actions = data.runs.filter((run) => run.action !== "keep");

  return [
    `${String(data.runs.length)} run(s) recorded.` +
      (actions.length > 0
        ? ` ${String(actions.length)} rule(s) carry an action other than keep: ` +
          `${actions.map((run) => `\`${run.rule}\` → ${run.action}`).join(", ")}.`
        : " Every measured rule is marked keep."),
    "",
    ...sections
  ].join("\n\n");
};

const main = (): void => {
  const raw = readFileSync(LEDGER_PATH, "utf8");
  const data = parseLedger(raw);
  const updated = replaceRegion(raw, GENERATED_MARKER, renderLedgerMarkdown(data));

  if (updated !== raw) {
    writeFileSync(LEDGER_PATH, updated);
    console.log(chalk.gray(`Generated region updated: ${LEDGER_PATH}`));
  }

  console.log(chalk.green(`Harness evals rendered. Runs: ${String(data.runs.length)}`));
};

if (process.argv[1] !== undefined && process.argv[1].endsWith("harness-eval.ts")) {
  try {
    main();
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
