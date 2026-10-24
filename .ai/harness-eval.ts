#!/usr/bin/env tsx

// Renders the harness-eval ledger's generated region from its data block.
// Deterministic arithmetic only: the verdicts are recorded by a human running
// kaine-harness-eval, and nothing here executes a trial or calls a model.
//
// Modelled on scorecard-render.ts, and human-invoked for the same reason: this
// measures judgment, so it must never gate a PR. `--check` is the exception
// that proves it: it only confirms the generated region still matches the data
// block, which is arithmetic, and `ai:test` runs it so the two cannot drift.

import chalk from "chalk";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format as formatWithPrettier, resolveConfig } from "prettier";

import { REPO_ROOT } from "./ai.util";
import { extractRegion, replaceRegion } from "./scorecard.util";

export const LEDGER_PATH = join(REPO_ROOT, "docs", "agents", "harness-evals.md");
export const DATA_MARKER = "harness-eval:data";
export const GENERATED_MARKER = "harness-eval:generated";

export const ARMS = ["with", "without"] as const;
export const CONCLUSIONS = ["effect", "no-effect", "inconclusive"] as const;
export const ACTIONS = ["keep", "tighten", "delete", "promote-to-lint"] as const;
/** The two arms of a calibration: the same setup, run twice. */
export const CALIBRATION_ARMS = ["first", "second"] as const;
/**
 * The smallest noise floor. Mean verdicts at n = 3 move in steps of 1/3, so a calibration
 * that happens to agree exactly would otherwise call every difference an effect.
 */
export const MIN_NOISE_FLOOR = 0.5;
/** An inconclusive run decides nothing: it may only ask for a better measurement. */
const DECIDING_ACTIONS: readonly (typeof ACTIONS)[number][] = ["keep", "delete", "promote-to-lint"];

export type Arm = (typeof ARMS)[number];
export type CalibrationArm = (typeof CALIBRATION_ARMS)[number];

export interface CalibrationTrial {
  arm: CalibrationArm;
  verdict: number;
  transcript: string;
}

/** An A/A run: the same task and setup twice. Its difference is the noise floor of later runs. */
export interface Calibration {
  id: string;
  date: string;
  model: string;
  agent: string;
  taskFamily: string;
  trials: CalibrationTrial[];
}

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
  /** `2`: the conclusion is checked against a calibration's noise floor. Absent on older runs. */
  protocol?: 2;
  /** The calibration id a protocol 2 run is measured against. */
  calibration?: string;
}

export interface LedgerData {
  runs: EvalRun[];
  calibrations?: Calibration[];
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

const requireVerdict = (value: unknown, path: string): number => {
  if (typeof value !== "number" || value < 1 || value > 5) {
    throw new Error(`harness-eval:data: ${path}.verdict must be a number from 1 to 5`);
  }
  return value;
};

const parseTrial = (value: unknown, path: string): EvalTrial => {
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path} must be an object`);
  }

  return {
    arm: requireMember(value["arm"], ARMS, `${path}.arm`),
    verdict: requireVerdict(value["verdict"], path),
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

  const parsed: EvalRun = {
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
  if (value["protocol"] === undefined) return parsed;
  if (value["protocol"] !== 2) {
    throw new Error(`harness-eval:data: ${path}.protocol must be 2 when it is set`);
  }
  return {
    ...parsed,
    protocol: 2,
    calibration: requireString(value["calibration"], `${path}.calibration`)
  };
};

const parseCalibrationTrial = (value: unknown, path: string): CalibrationTrial => {
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path} must be an object`);
  }
  return {
    arm: requireMember(value["arm"], CALIBRATION_ARMS, `${path}.arm`),
    verdict: requireVerdict(value["verdict"], path),
    transcript: requireString(value["transcript"], `${path}.transcript`)
  };
};

const parseCalibration = (value: unknown, index: number): Calibration => {
  const path = `calibrations[${String(index)}]`;
  if (!isRecord(value)) {
    throw new Error(`harness-eval:data: ${path} must be an object`);
  }
  const trials = value["trials"];
  if (!Array.isArray(trials)) {
    throw new Error(`harness-eval:data: ${path}.trials must be an array`);
  }
  const calibration: Calibration = {
    id: requireString(value["id"], `${path}.id`),
    date: requireString(value["date"], `${path}.date`),
    model: requireString(value["model"], `${path}.model`),
    agent: requireString(value["agent"], `${path}.agent`),
    taskFamily: requireString(value["taskFamily"], `${path}.taskFamily`),
    trials: trials.map((trial, trialIndex) =>
      parseCalibrationTrial(trial, `${path}.trials[${String(trialIndex)}]`)
    )
  };
  for (const arm of CALIBRATION_ARMS) {
    if (!calibration.trials.some((trial) => trial.arm === arm)) {
      throw new Error(`harness-eval:data: ${path} needs at least one ${arm} trial`);
    }
  }
  return calibration;
};

/**
 * The arithmetic must back the words. An inconclusive run never keeps, deletes or promotes a
 * rule. A protocol 2 run calls an effect only above its calibration's noise floor, and no
 * effect only within it.
 */
const checkConclusion = (
  run: EvalRun,
  calibrations: readonly Calibration[],
  index: number
): void => {
  const path = `runs[${String(index)}]`;
  if (run.conclusion === "inconclusive" && DECIDING_ACTIONS.includes(run.action)) {
    throw new Error(
      `harness-eval:data: ${path} is inconclusive, so its action cannot be ${run.action}. Use tighten and measure again.`
    );
  }
  if (run.protocol !== 2) return;
  const calibration = calibrations.find((candidate) => candidate.id === run.calibration);
  if (calibration === undefined) {
    throw new Error(
      `harness-eval:data: ${path}.calibration names no calibration: ${run.calibration ?? ""}`
    );
  }
  const floor = noiseFloor(calibration);
  const delta = Math.abs(verdictDelta(run));
  if (run.conclusion === "effect" && delta <= floor) {
    throw new Error(
      `harness-eval:data: ${path} calls an effect, but |Δ| ${format(delta)} is within the noise floor ${format(floor)}.`
    );
  }
  if (run.conclusion === "no-effect" && delta > floor) {
    throw new Error(
      `harness-eval:data: ${path} calls no effect, but |Δ| ${format(delta)} is above the noise floor ${format(floor)}.`
    );
  }
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
    return { runs: [], calibrations: [] };
  }
  if (!Array.isArray(parsed["runs"])) {
    throw new Error("harness-eval:data: runs must be an array");
  }
  const rawCalibrations = parsed["calibrations"] ?? [];
  if (!Array.isArray(rawCalibrations)) {
    throw new Error("harness-eval:data: calibrations must be an array");
  }

  const calibrations = rawCalibrations.map(parseCalibration);
  const runs = parsed["runs"].map(parseRun);
  runs.forEach((run, index) => checkConclusion(run, calibrations, index));
  return { runs, calibrations };
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const format = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/** The difference between the two arms of a calibration, never below `MIN_NOISE_FLOOR`. */
export const noiseFloor = (calibration: Calibration): number => {
  const armMean = (arm: CalibrationArm): number =>
    mean(calibration.trials.filter((trial) => trial.arm === arm).map((trial) => trial.verdict));
  return Math.max(MIN_NOISE_FLOOR, Math.abs(armMean("first") - armMean("second")));
};

const signed = (value: number): string => (value > 0 ? `+${format(value)}` : format(value));

const armVerdicts = (run: EvalRun, arm: Arm): number[] =>
  run.trials.filter((trial) => trial.arm === arm).map((trial) => trial.verdict);

/** Mean verdict with the rule minus mean verdict without it. */
export const verdictDelta = (run: EvalRun): number =>
  mean(armVerdicts(run, "with")) - mean(armVerdicts(run, "without"));

/** Metric names appearing in either arm, so a missing metric reads as absent. */
const metricNames = (run: EvalRun): string[] =>
  [...new Set(run.trials.flatMap((trial) => Object.keys(trial.metrics)))].sort();

const armMetric = (run: EvalRun, arm: Arm, metric: string): number =>
  mean(
    run.trials
      .filter((trial) => trial.arm === arm)
      .flatMap((trial) => (metric in trial.metrics ? [trial.metrics[metric] ?? 0] : []))
  );

/** For a protocol 2 run: its noise floor and where `|Δ|` falls. Older runs print nothing extra. */
const noiseLine = (run: EvalRun, calibrations: readonly Calibration[]): string[] => {
  const calibration = calibrations.find((candidate) => candidate.id === run.calibration);
  if (run.protocol !== 2 || calibration === undefined) return [];
  const floor = noiseFloor(calibration);
  const delta = Math.abs(verdictDelta(run));
  return [
    "",
    `Noise floor ${format(floor)} from calibration \`${calibration.id}\`: ` +
      `|Δ| ${format(delta)} is ${delta > floor ? "above" : "within"} it.`
  ];
};

export const renderLedgerMarkdown = (data: LedgerData): string => {
  if (data.runs.length === 0) {
    return "_No runs recorded yet. Run the `kaine-harness-eval` skill, then `pnpm harness:eval`._";
  }
  const calibrations = data.calibrations ?? [];

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
      ...noiseLine(run, calibrations),
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
  const calibrationLines =
    calibrations.length === 0
      ? []
      : [
          "### Calibrations",
          [
            "| Id | Date | Model via agent | Task family | Trials | Noise floor |",
            "| --- | --- | --- | --- | --- | --- |",
            ...calibrations.map(
              (calibration) =>
                `| \`${calibration.id}\` | ${calibration.date} | ${calibration.model} via ${calibration.agent} | ` +
                `${calibration.taskFamily} | ${String(calibration.trials.length)} | ${format(noiseFloor(calibration))} |`
            )
          ].join("\n")
        ];

  return [
    `${String(data.runs.length)} run(s) recorded.` +
      (actions.length > 0
        ? ` ${String(actions.length)} rule(s) carry an action other than keep: ` +
          `${actions.map((run) => `\`${run.rule}\` → ${run.action}`).join(", ")}.`
        : " Every measured rule is marked keep."),
    "",
    ...sections,
    ...calibrationLines
  ].join("\n\n");
};

const main = async (): Promise<void> => {
  const raw = readFileSync(LEDGER_PATH, "utf8");
  const data = parseLedger(raw);
  // Formatted as the committed file is, or prettier's table alignment alone
  // would read as drift.
  const updated = await formatWithPrettier(
    replaceRegion(raw, GENERATED_MARKER, renderLedgerMarkdown(data)),
    {
      ...(await resolveConfig(LEDGER_PATH)),
      filepath: LEDGER_PATH
    }
  );

  if (process.argv.includes("--check")) {
    if (updated !== raw) {
      throw new Error(`Generated region is stale: ${LEDGER_PATH}. Run pnpm harness:eval.`);
    }
    console.log(chalk.green(`Harness eval ledger is current. Runs: ${String(data.runs.length)}`));
    return;
  }

  if (updated !== raw) {
    writeFileSync(LEDGER_PATH, updated);
    console.log(chalk.gray(`Generated region updated: ${LEDGER_PATH}`));
  }

  console.log(chalk.green(`Harness evals rendered. Runs: ${String(data.runs.length)}`));
};

if (process.argv[1] !== undefined && process.argv[1].endsWith("harness-eval.ts")) {
  main().catch((error: unknown) => {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
