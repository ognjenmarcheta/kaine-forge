import { realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import type { DeskConfig } from "../contracts";
import { diffAgainstBase, type DiffResult } from "../git";
import { systemClock, type Clock, type Exec } from "../ports";
import {
  checkReportSchema,
  type CheckKind,
  type CheckReport,
  type CheckStepReport
} from "./check.contract";
import { fingerprintFailure } from "./check.fingerprint";
import { boundedTail } from "../process/process.output";
import { writeJsonAtomic } from "../store/store.atomic";

export const CHECK_REPORT_FILE = "check-report.json";

/** The generate step. The engine runs it, never the agent. */
export const GENERATE_ARGV: readonly string[] = ["pnpm", "generate"];

const DEFAULT_STEP_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_GENERATE_TIMEOUT_MS = 10 * 60_000;
/** Checks run unattended: no colour codes in the captured output. */
const CHECK_ENV = { NO_COLOR: "1", FORCE_COLOR: "0" } as const;

/**
 * Where the steps run and where the diff is taken. The default is the host
 * worktree. The Docker isolation passes an executor that runs each step in a
 * container and hashes the container workspace. The report, the fingerprint and
 * the drift rules stay the same code.
 */
export interface CheckExecutor {
  /** Runs one step. The request's `cwd` is the host worktree and may be ignored. */
  readonly exec: Exec;
  /** The diff of the working tree against the base, taken where the steps ran. */
  readonly diff: () => Promise<DiffResult>;
  /** Folders the fingerprint treats as noise. Default: the worktree, the temp dir, the home dir. */
  readonly roots?: readonly string[];
}

export interface RunChecksRequest {
  readonly worktree: string;
  readonly kind: CheckKind;
  readonly config: Pick<DeskConfig, "checks">;
  readonly exec: Exec;
  /** Full commit hash the diff is taken against. */
  readonly baseSha: string;
  /** Directory that receives `check-report.json`. */
  readonly artifactsDir: string;
  readonly clock?: Clock;
  readonly executor?: CheckExecutor | undefined;
  /** Per configured step. Defaults to 30 minutes. */
  readonly stepTimeoutMs?: number;
  /** For `pnpm generate`. Defaults to 10 minutes. */
  readonly generateTimeoutMs?: number;
}

interface StepOutcome {
  readonly report: CheckStepReport;
  /** Full output, for the fingerprint. */
  readonly output: string;
}

interface Failure {
  readonly argv: readonly string[];
  readonly output: string;
  readonly timedOut: boolean;
  /** Replaces the output in the fingerprint when the failure is not in the output. */
  readonly lines?: readonly string[];
}

const failureOf = ({ report, output }: StepOutcome): Failure | null =>
  report.code === 0 ? null : { argv: report.argv, output, timedOut: report.timedOut };

/** Per-file sections of a patch, keyed by the `diff --git` header line. */
const sections = (patch: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const part of patch.split(/^(?=diff --git )/m)) {
    const header = part.split("\n", 1)[0];
    if (header !== undefined && header.startsWith("diff --git ")) map.set(header, part);
  }
  return map;
};

/** Files whose patch differs between two diffs, as `diff --git` headers stripped to paths. */
const driftedPaths = (before: DiffResult, after: DiffResult): string[] => {
  const was = sections(before.patch);
  const now = sections(after.patch);
  const changed = new Set<string>();
  for (const header of new Set([...was.keys(), ...now.keys()])) {
    if (was.get(header) !== now.get(header)) {
      changed.add(header.replace(/^diff --git a\/(.*) b\/.*$/, "$1"));
    }
  }
  return [...changed].sort();
};

/**
 * Run the configured checks for `kind` in the worktree, one after the other,
 * then write `check-report.json`. Order:
 *
 * 1. `pnpm generate`, with the diff hashed before and after. Any change is
 *    drift: the round fails and the later steps do not run. The generated
 *    files stay in the tree so the next round starts from them.
 * 2. The `config.checks[kind]` steps. The first failing step ends the run.
 *
 * A failing command is a result, not an exception. A git failure while
 * hashing the diff does throw.
 */
export const runChecks = async (request: RunChecksRequest): Promise<CheckReport> => {
  const { worktree, kind, exec, baseSha } = request;
  const clock = request.clock ?? systemClock;
  const startedAt = clock.now();
  const roots =
    request.executor?.roots ??
    (await Promise.all(
      [worktree, tmpdir(), homedir()].flatMap((dir) => [dir, realpath(dir).catch(() => dir)])
    ));
  const stepExec = request.executor?.exec ?? exec;
  const currentDiff = (): Promise<DiffResult> =>
    request.executor === undefined
      ? diffAgainstBase(exec, worktree, baseSha)
      : request.executor.diff();

  const runStep = async (argv: readonly string[], timeoutMs: number): Promise<StepOutcome> => {
    const began = clock.now().getTime();
    const result = await stepExec({ argv, cwd: worktree, env: CHECK_ENV, timeoutMs });
    const output = [result.stdout, result.stderr].filter((part) => part !== "").join("\n");
    const notes = [
      ...(result.timedOut ? [`[timed out after ${Math.round(timeoutMs / 1000)}s]`] : []),
      ...(result.truncated ? ["[output truncated]"] : [])
    ];
    return {
      output,
      report: {
        argv: [...argv],
        code: result.code,
        timedOut: result.timedOut,
        tail: [boundedTail(output), ...notes].filter((part) => part !== "").join("\n"),
        durationMs: Math.max(0, clock.now().getTime() - began)
      }
    };
  };

  const steps: CheckStepReport[] = [];
  let generatedDrift = false;

  const before = await currentDiff();
  let current = before;

  const generate = await runStep(
    GENERATE_ARGV,
    request.generateTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS
  );
  steps.push(generate.report);
  let failure = failureOf(generate);

  if (failure === null) {
    current = await currentDiff();
    if (current.diffHash !== before.diffHash) {
      generatedDrift = true;
      const paths = driftedPaths(before, current);
      steps.push({
        argv: [...GENERATE_ARGV],
        code: 1,
        timedOut: false,
        tail: `pnpm generate changed the tree. Generated output was not up to date:\n${paths.join("\n")}`,
        durationMs: 0
      });
      failure = {
        argv: GENERATE_ARGV,
        output: "",
        timedOut: false,
        lines: ["generated drift", ...paths]
      };
    }
  }

  let ranConfigured = false;
  if (failure === null) {
    for (const argv of request.config.checks[kind]) {
      ranConfigured = true;
      const outcome = await runStep(argv, request.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS);
      steps.push(outcome.report);
      failure = failureOf(outcome);
      if (failure !== null) break;
    }
  }

  // Steps may touch files, so hash the tree as it is when the checks end.
  if (ranConfigured) current = await currentDiff();

  const draft: CheckReport = {
    passed: failure === null,
    kind,
    steps,
    fingerprint:
      failure === null
        ? null
        : fingerprintFailure({
            argv: failure.argv,
            output: failure.output,
            timedOut: failure.timedOut,
            roots,
            ...(failure.lines === undefined ? {} : { lines: failure.lines })
          }),
    diffHash: current.diffHash,
    generatedDrift,
    startedAt: startedAt.toISOString(),
    finishedAt: clock.now().toISOString()
  };
  const report = checkReportSchema.parse(draft);
  await writeJsonAtomic(path.join(request.artifactsDir, CHECK_REPORT_FILE), report);
  return report;
};
