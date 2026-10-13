import { readFile } from "node:fs/promises";
import path from "node:path";

import { feedbackTargetSchema, isolationSchema, stageSchema, FEEDBACK_TARGETS } from "../contracts";
import { parse, parseIssueNumber, requireIssue } from "./cli.args";
import { describeResult } from "./cli.format";
import { markNoWriteback, openRuntime } from "./cli.runtime";
import { UsageError, type CliCommand, type CliDeps, type CliIo } from "./cli.types";
import type { PipelineRunner } from "../engine/pipeline.runner";
import type { ShipActionResult } from "../engine/pipeline.types";

/**
 * Commands that change an issue and may drive it: `start`, `approve`,
 * `feedback`, `continue`, `cancel`, `ship`, and `remove`. Each one opens the
 * runtime (config, runner, log, notifier), recovers interrupted issues, makes
 * one runner call, and prints where the issue stopped.
 */

const printResult = (io: CliIo, issue: number, result: ShipActionResult, json: boolean): number => {
  const view = describeResult(issue, result);
  if (json) io.out(`${JSON.stringify(view.json, null, 2)}\n`);
  else if (view.toStderr) io.err(view.text);
  else io.out(view.text);
  return view.code;
};

interface DriveOptions {
  readonly issue: number;
  readonly json: boolean;
  readonly noWriteback: boolean;
  /** Mark the issue so later calls write nothing to GitHub either. */
  readonly persistNoWriteback?: boolean;
}

const drive = async (
  deps: CliDeps,
  io: CliIo,
  options: DriveOptions,
  call: (runner: PipelineRunner) => Promise<ShipActionResult>
): Promise<number> => {
  const opened = await openRuntime(deps, io, {
    json: options.json,
    persistLog: true,
    noWriteback: options.noWriteback,
    issue: options.issue,
    recover: true
  });
  if (!opened.ok) {
    io.err(`${opened.message}\n`);
    return 1;
  }
  const { runtime } = opened;
  try {
    const result = await call(runtime.runner);
    if (options.persistNoWriteback === true) await markNoWriteback(runtime.store, options.issue);
    return printResult(io, options.issue, result, options.json);
  } finally {
    await runtime.settle();
  }
};

export const commandStart: CliCommand = (args, deps, io) => {
  const { values, positionals } = parse(args, {
    override: { type: "boolean" },
    "no-writeback": { type: "boolean" },
    "snapshot-file": { type: "string" },
    isolation: { type: "string" },
    json: { type: "boolean" }
  });
  const usage =
    "pnpm desk start <issue> [--override] [--no-writeback] [--snapshot-file <path>] [--isolation host|docker]";
  const issue = requireIssue(positionals, usage);
  const isolation =
    values.isolation === undefined ? undefined : isolationSchema.safeParse(values.isolation);
  if (isolation !== undefined && !isolation.success) {
    throw new UsageError(`--isolation takes host or docker. Usage: ${usage}`);
  }
  const snapshotFile = values["snapshot-file"];
  const quiet = values["no-writeback"] === true || snapshotFile !== undefined;
  return drive(
    deps,
    io,
    {
      issue,
      json: values.json === true,
      noWriteback: quiet,
      persistNoWriteback: quiet
    },
    (runner) =>
      runner.start(issue, {
        override: values.override === true,
        ...(isolation === undefined ? {} : { isolation: isolation.data }),
        ...(snapshotFile === undefined
          ? {}
          : { snapshotFile: path.resolve(deps.cwd, snapshotFile) })
      })
  );
};

/** `approve` and `cancel` take an issue and make one runner call. */
const simple =
  (
    usage: string,
    call: (runner: PipelineRunner, issue: number) => Promise<ShipActionResult>
  ): CliCommand =>
  (args, deps, io) => {
    const { values, positionals } = parse(args, {
      "no-writeback": { type: "boolean" },
      json: { type: "boolean" }
    });
    const issue = requireIssue(positionals, usage);
    return drive(
      deps,
      io,
      { issue, json: values.json === true, noWriteback: values["no-writeback"] === true },
      (runner) => call(runner, issue)
    );
  };

export const commandApprove = simple("pnpm desk approve <issue>", (runner, issue) =>
  runner.approvePlan(issue)
);

export const commandCancel = simple("pnpm desk cancel <issue>", (runner, issue) =>
  runner.cancel(issue)
);

const SHIP_USAGE = "pnpm desk ship <issue> [--confirm | --dry-run] [--json]";

/**
 * `ship` opens a draft PR, so it needs a clear yes. `--confirm` is the yes. On a
 * terminal the command asks. Without a terminal it refuses. `--dry-run` writes
 * the plan and the PR body and changes nothing. The desk never merges.
 */
export const commandShip: CliCommand = (args, deps, io) => {
  const { values, positionals } = parse(args, {
    confirm: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "no-writeback": { type: "boolean" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, SHIP_USAGE);
  const dryRun = values["dry-run"] === true;
  if (dryRun && values.confirm === true) {
    throw new UsageError(`Use --dry-run or --confirm, not both. Usage: ${SHIP_USAGE}`);
  }
  return drive(
    deps,
    io,
    { issue, json: values.json === true, noWriteback: values["no-writeback"] === true },
    async (runner) => {
      if (dryRun) return runner.ship(issue, { confirm: false, dryRun: true });
      if (values.confirm === true) return runner.ship(issue, { confirm: true });

      // No flag. Ask only where the ship can start. Elsewhere the runner gives its own refusal.
      const [entry] = await runner.status(issue);
      const state = entry?.result.status === "ok" ? entry.result.state : null;
      if (state?.stage !== "pr-review") return runner.ship(issue, { confirm: false });
      const decline = (reason: string): ShipActionResult => ({
        outcome: "refused",
        refusal: "ship-refused",
        reason: `${reason} Nothing was changed.`,
        state
      });
      if (deps.ask === undefined) {
        return decline(
          `Shipping needs your explicit yes, and there is no terminal to ask. Run: pnpm desk ship ${issue} --confirm.`
        );
      }
      const yes = await deps.ask(`Ship #${issue} as a draft PR? [y/N] `);
      return yes ? runner.ship(issue, { confirm: true }) : decline("You did not confirm.");
    }
  );
};

export const commandContinue: CliCommand = (args, deps, io) => {
  const { values, positionals } = parse(args, {
    from: { type: "string" },
    "no-writeback": { type: "boolean" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, "pnpm desk continue <issue> [--from <stage>]");
  const from = values.from;
  const stage = from === undefined ? undefined : stageSchema.safeParse(from);
  if (stage !== undefined && !stage.success) throw new UsageError(`'${from}' is not a stage.`);
  return drive(
    deps,
    io,
    { issue, json: values.json === true, noWriteback: values["no-writeback"] === true },
    (runner) => runner.continueFrom(issue, stage?.data)
  );
};

const FEEDBACK_USAGE = `pnpm desk feedback <issue> --to ${FEEDBACK_TARGETS.join("|")} <text...> | --file <path>`;

export const commandFeedback: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    to: { type: "string" },
    file: { type: "string" },
    "no-writeback": { type: "boolean" },
    json: { type: "boolean" }
  });
  const [first, ...words] = positionals;
  const issue = parseIssueNumber(first);
  const target = feedbackTargetSchema.safeParse(values.to);
  if (!target.success) throw new UsageError(`Usage: ${FEEDBACK_USAGE}`);
  const fromFile = values.file;
  if (fromFile !== undefined && words.length > 0) {
    throw new UsageError("Give the feedback as words or with --file, not both.");
  }
  let text: string;
  if (fromFile === undefined) {
    text = words.join(" ").trim();
  } else {
    try {
      text = (await readFile(path.resolve(deps.cwd, fromFile), "utf8")).trim();
    } catch (error) {
      io.err(
        `Cannot read ${fromFile}: ${error instanceof Error ? error.message : "unknown error"}\n`
      );
      return 1;
    }
  }
  if (text === "") throw new UsageError(`Feedback needs text. Usage: ${FEEDBACK_USAGE}`);

  return drive(
    deps,
    io,
    { issue, json: values.json === true, noWriteback: values["no-writeback"] === true },
    (runner) => runner.feedback(issue, target.data, text)
  );
};

const REMOVE_USAGE = "pnpm desk remove <issue> [--force] [--keep-worktree]";

export const commandRemove: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    force: { type: "boolean" },
    "keep-worktree": { type: "boolean" },
    "no-writeback": { type: "boolean" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, REMOVE_USAGE);
  const json = values.json === true;

  const opened = await openRuntime(deps, io, {
    json,
    persistLog: false,
    noWriteback: values["no-writeback"] === true,
    issue,
    recover: false
  });
  if (!opened.ok) {
    io.err(`${opened.message}\n`);
    return 1;
  }
  const { runtime } = opened;
  try {
    const [entry] = await runtime.runner.status(issue);
    if (entry?.result.status === "missing") {
      const text = `#${issue} has no desk state. Nothing to remove.`;
      if (json)
        io.out(
          `${JSON.stringify({ ok: false, issue, outcome: "refused", refusal: "unknown-issue", reason: text })}\n`
        );
      else io.err(`${text}\n`);
      return 1;
    }
    const result = await runtime.runner.remove(issue, {
      force: values.force === true,
      keepWorktree: values["keep-worktree"] === true
    });
    if (result.outcome === "refused") return printResult(io, issue, result, json);

    const worktree = result.worktreeRemoved
      ? "The worktree is removed."
      : "The worktree stays on disk.";
    const branch =
      result.branch === null ? "" : ` The branch '${result.branch}' stays in the repository.`;
    if (json) {
      io.out(
        `${JSON.stringify({ ok: true, issue, outcome: "removed", worktreeRemoved: result.worktreeRemoved, branch: result.branch })}\n`
      );
    } else {
      io.out(`#${issue}: removed the desk state. ${worktree}${branch}\n`);
    }
    return 0;
  } finally {
    await runtime.settle();
  }
};
