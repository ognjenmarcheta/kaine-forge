import type { CheckReport } from "../check";
import type { StageHandler } from "./pipeline.types";
import { fenceUntrusted } from "../github/github.authorization";
import { selectIsolation } from "../isolation/isolation.select";
import { boundedTail } from "../process/process.output";

const STEP_TAIL_CHARS = 6000;
const TOTAL_CHARS = 12_000;

const argvText = (argv: readonly string[]): string => argv.join(" ");

/** The failing steps of a report, as the builder reads them. */
export const checkFailureText = (report: CheckReport): string => {
  const parts = report.steps
    .filter((step) => step.code !== 0)
    .map(
      (step) =>
        `### \`${argvText(step.argv)}\` (${step.timedOut ? "timed out" : `exit ${step.code ?? "none"}`})\n\`\`\`\n${boundedTail(step.tail, 120, STEP_TAIL_CHARS)}\n\`\`\``
    );
  return parts.join("\n\n").slice(0, TOTAL_CHARS);
};

/** Check: the engine runs `pnpm generate` and the configured checks. No agent is involved. */
export const checkStage: StageHandler = async (context) => {
  const { deps } = context;
  const state = context.state();
  if (state.worktreePath === null || state.baseSha === null || state.baseSha === undefined) {
    return {
      kind: "needs-you",
      reason: "Check cannot start: there is no worktree or base commit. Continue from setup."
    };
  }
  const { worktreePath: worktree, baseSha } = state;
  const isolation = selectIsolation(deps, state);
  if (!isolation.ok) return { kind: "needs-you", reason: isolation.reason };

  let report: CheckReport;
  try {
    report = await context.scheduler.check.run(() =>
      isolation.port.runChecks({
        issue: context.issue,
        worktree,
        kind: "loop",
        config: deps.config,
        exec: deps.exec,
        baseSha,
        artifactsDir: context.artifactsDir,
        clock: deps.clock
      })
    );
  } catch (error) {
    return {
      kind: "needs-you",
      reason: `The checks could not run: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }

  if (report.passed) {
    return {
      kind: "trigger",
      trigger: { type: "check-pass" },
      event: "check-passed",
      note: `${report.steps.length} step(s) passed`
    };
  }
  const failure = checkFailureText(report);
  return {
    kind: "trigger",
    trigger: { type: "check-fail", fingerprint: report.fingerprint ?? "unknown" },
    event: "check-failed",
    note: report.generatedDrift
      ? "pnpm generate changed the tree"
      : `fingerprint ${(report.fingerprint ?? "unknown").slice(0, 12)}`,
    patch: {
      pendingFeedback: {
        target: "build",
        source: "check",
        text: `The engine ran the checks after your change and they failed. Fix the root causes. Never weaken a lint rule or skip or delete a test to pass.\n\n${fenceUntrusted(failure, "check run")}`
      }
    }
  };
};
