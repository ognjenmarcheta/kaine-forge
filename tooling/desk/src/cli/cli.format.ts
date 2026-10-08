import type { IssueState, IssueStatus, Stage } from "../contracts";
import { needsYouReason } from "../engine/pipeline.state";
import type {
  Refusal,
  ShipActionResult,
  ShipDryRunResult,
  StopKind
} from "../engine/pipeline.types";
import type { ShipPlan } from "../ship/ship.contract";

/** Terminal bell. A gate or a stop is where a person must act. */
export const BELL = "\u0007";

/** The commands that move an issue on from where it waits. Shown at every stop. */
export const nextSteps = (state: IssueState): string[] => {
  const n = state.issueNumber;
  switch (state.stage) {
    case "plan-gate":
      return [
        `approve with: pnpm desk approve ${n}`,
        `or send feedback: pnpm desk feedback ${n} --to plan "<text>"`
      ];
    case "pr-review":
      return [
        `send feedback: pnpm desk feedback ${n} --to build|review|plan "<text>"`,
        `see what ship would do: pnpm desk ship ${n} --dry-run`,
        `ship as a draft PR: pnpm desk ship ${n} --confirm`
      ];
    case "needs-you": {
      if (state.resumeStage === "intake") {
        return [`fix the issue, then run: pnpm desk start ${n}`];
      }
      const retry = state.resumeStage === null ? "" : ` (retries '${state.resumeStage}')`;
      return [
        `continue with: pnpm desk continue ${n}${retry}`,
        `or send feedback: pnpm desk feedback ${n} --to build "<text>"`
      ];
    }
    case "shipped":
      return state.prUrl
        ? [
            `open the draft PR: ${state.prUrl}`,
            "review it and merge it yourself on GitHub. The desk never merges."
          ]
        : [];
    default:
      return [];
  }
};

/** The `--json` shape of a driving command. */
export type ResultJson =
  | {
      readonly ok: false;
      readonly issue: number;
      readonly outcome: "refused";
      readonly refusal: Refusal;
      readonly reason: string;
      readonly stage: Stage | null;
      readonly status: IssueStatus | null;
    }
  | {
      readonly ok: boolean;
      readonly issue: number;
      readonly outcome: "dry-run";
      readonly plan: ShipPlan;
      readonly files: ShipDryRunResult["files"];
    }
  | {
      readonly ok: boolean;
      readonly issue: number;
      readonly outcome: "stopped";
      readonly stop: StopKind;
      readonly stage: Stage;
      readonly status: IssueStatus;
      readonly message: string | null;
      /** The draft PR, once the issue is shipped. */
      readonly prUrl: string | null;
      readonly next: readonly string[];
    };

export interface ResultView {
  readonly code: number;
  /** Human text for stdout (stops) or stderr (refusals). */
  readonly text: string;
  readonly toStderr: boolean;
  readonly json: ResultJson;
}

const STOP_TITLE: Readonly<Record<StopKind, string>> = {
  gate: "waiting for you",
  "needs-you": "needs you",
  shipped: "shipped",
  cancelled: "cancelled"
};

const changesetLine = (plan: ShipPlan): string => {
  const { changeset } = plan;
  switch (changeset.kind) {
    case "file":
      return `a changeset file ${changeset.path} (${changeset.bump} for ${changeset.packages.join(", ")})`;
    case "skip-label":
      return `no file; the PR gets the '${changeset.label}' label (${changeset.reason})`;
    case "none":
      return `none (${changeset.reason})`;
    case "invalid":
      return `cannot be decided (${changeset.reason})`;
  }
};

/**
 * A dry run prints the plan: the gate verdict, the files, the PR title, the
 * changeset decision and where `pr-body.md` is. It exits 1 when the gate
 * would refuse, so a script can use it.
 */
const describeDryRun = (issue: number, result: ShipDryRunResult): ResultView => {
  const { plan, files } = result;
  const problems = [
    ...plan.attribution.map((entry) => `AI attribution in the ${entry.source}: ${entry.message}`),
    ...(plan.commitlint.ok ? [] : [`commitlint rejects the message: ${plan.commitlint.output}`]),
    ...(plan.gitIdentityProblem === null ? [] : [plan.gitIdentityProblem])
  ];
  const lines = [
    `#${issue}: ship dry run. Nothing was changed.`,
    plan.gate.ok
      ? "Gate: it would pass."
      : `Gate: it would refuse.\n${plan.gate.failures.map((failure) => `  - ${failure.kind}: ${failure.message}`).join("\n")}`,
    `PR: draft against ${plan.pullRequest.base}, title "${plan.pullRequest.title}"`,
    `Branch: ${plan.branch ?? "none"}; it pushes to ${plan.pushes}`,
    `Changeset: ${changesetLine(plan)}`,
    `Files (${plan.files.length}):`,
    ...plan.files.map((file) => `  ${file}`),
    ...(plan.unfilledHeadings.length === 0
      ? []
      : [`PR body headings left empty: ${plan.unfilledHeadings.join(", ")}`]),
    ...problems.map((problem) => `Problem: ${problem}`),
    `PR body: ${files.prBody}`,
    `Plan: ${files.plan}`,
    plan.gate.ok && problems.length === 0
      ? `Next: pnpm desk ship ${issue} --confirm`
      : "Fix the problems above, then run the dry run again."
  ];
  return {
    code: plan.gate.ok ? 0 : 1,
    toStderr: false,
    text: `${lines.join("\n")}\n`,
    json: { ok: plan.gate.ok, issue, outcome: "dry-run", plan, files }
  };
};

/**
 * Exit codes: 0 at a human gate or done, 1 when the issue needs you or the
 * call was refused. The bell rings at a gate and at `needs-you`.
 */
export const describeResult = (issue: number, result: ShipActionResult): ResultView => {
  if (result.outcome === "dry-run") return describeDryRun(issue, result);
  if (result.outcome === "refused") {
    return {
      code: 1,
      toStderr: true,
      text: `#${issue}: refused (${result.refusal}). ${result.reason}\n`,
      json: {
        ok: false,
        issue,
        outcome: "refused",
        refusal: result.refusal,
        reason: result.reason,
        stage: result.state?.stage ?? null,
        status: result.state?.status ?? null
      }
    };
  }
  const { state, stop, message } = result;
  const steps = nextSteps(state);
  const alarm = stop === "gate" || stop === "needs-you";
  const lines = [
    `${alarm ? BELL : ""}#${issue}: ${STOP_TITLE[stop]} (stage ${state.stage}, ${state.status})`,
    ...(message === null ? [] : [message]),
    ...(steps.length === 0 ? [] : ["Next:", ...steps.map((step) => `  ${step}`)])
  ];
  return {
    code: stop === "needs-you" ? 1 : 0,
    toStderr: false,
    text: `${lines.join("\n")}\n`,
    json: {
      ok: stop !== "needs-you",
      issue,
      outcome: "stopped",
      stop,
      stage: state.stage,
      status: state.status,
      message,
      prUrl: state.prUrl ?? null,
      next: steps
    }
  };
};

export const formatState = (state: IssueState): string[] => {
  const reason = needsYouReason(state);
  const lines = [
    `#${state.issueNumber}: ${state.stage} (${state.status})`,
    `  loops: check ${state.loops.check}, review ${state.loops.review}`
  ];
  if (state.branch) lines.push(`  branch: ${state.branch}`);
  if (state.worktreePath) lines.push(`  worktree: ${state.worktreePath}`);
  if (state.authorization) {
    const { actor, override } = state.authorization;
    lines.push(`  authorized by: ${actor}${override ? " (override)" : ""}`);
  }
  if (reason !== null) lines.push(`  needs you: ${reason}`);
  for (const step of nextSteps(state)) lines.push(`  next: ${step}`);
  for (const event of state.history.slice(-5)) {
    lines.push(
      `  ${event.at} ${event.stage}: ${event.event}${event.note ? ` - ${event.note}` : ""}`
    );
  }
  return lines;
};
