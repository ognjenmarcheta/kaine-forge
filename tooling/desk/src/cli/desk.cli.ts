import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { createAgentProcess } from "../agents/agent.process";
import { createClaudeRunner } from "../agents/claude.runner";
import { createCodexRunner } from "../agents/codex.runner";
import { createGitPort } from "../git";
import { createGitHubPort } from "../github/github.port";
import { createExec, systemClock } from "../ports";
import { commandDoctor, commandLabels } from "./cli.command.admin";
import { commandContract } from "./cli.command.contract";
import { commandDocker } from "./cli.command.docker";
import { commandDraft } from "./cli.command.draft";
import {
  commandApprove,
  commandCancel,
  commandContinue,
  commandFeedback,
  commandRefresh,
  commandRemove,
  commandShip,
  commandStart
} from "./cli.command.drive";
import { commandLogs, commandResume, commandStatus } from "./cli.command.inspect";
import { commandLessons } from "./cli.command.lessons";
import { commandServe } from "./cli.command.serve";
import { commandStats } from "./cli.command.stats";
import { UsageError, type CliCommand, type CliDeps, type CliIo, type CliResult } from "./cli.types";

export type { CliDeps, CliResult, LiveOutput } from "./cli.types";

const USAGE = [
  "Usage: pnpm desk <command> [options]",
  "",
  "Drive an issue (each command runs until the next gate or stop, then exits):",
  "  start <issue> [--override] [--no-writeback] [--snapshot-file <path>] [--isolation host|docker]",
  "        [--flow <id>]             Run intake, then setup and the steps of the issue's flow",
  "                                  --isolation docker runs the builder and the checks in containers",
  "                                  --flow picks the flow; else flowLabels, then defaultFlow",
  "  approve <issue>                 Approve the plan at the plan gate",
  "  feedback <issue> --to <step> <text...>   (or --file <path>)",
  "                                  Send feedback to an agent or check step and run on",
  "  feedback <issue> --from-pr [text...]   (or --file <path>)",
  "                                  At pr-open: send the failing checks and trusted review comments",
  "                                  on the PR head, and your own words, back to build",
  "  continue <issue> [--from <stage>]   Retry the stage that needs you",
  "  cancel <issue>                  End the issue. The worktree stays",
  "  remove <issue> [--force] [--keep-worktree]   Delete desk state and worktree",
  "  draft <issue> [--snapshot-file <path>]",
  "                                  For an issue that stopped at intake: draft it in the issue format.",
  "                                  Prints the proposed body. Writes nothing to GitHub",
  "  ship <issue> [--confirm | --dry-run]",
  "                                  Commit, push, and open a draft PR. --dry-run changes nothing.",
  "                                  The desk never merges: you merge on GitHub",
  "  refresh <issue>                 At pr-open: read the PR once. Merged ends at shipped,",
  "                                  closed ends at cancelled, open changes nothing",
  "",
  "Look:",
  "  status [issue] [--json]         Show one issue, or list all",
  "  logs <issue> [--follow] [--json]   Show the agent log",
  "  resume <issue>                  Print the command that resumes the agent session by hand",
  "  stats [--role <role>] [--by-harness] [--json]",
  "                                  Compare agent runs by role, provider and model.",
  "                                  --by-harness also splits them by instruction version",
  "  lessons [--min-issues N] [--source S] [--json]",
  "                                  Problems seen in several issues: review findings, failed checks,",
  "                                  stuck runs, denials. Kept after remove. Promote with kaine-encode-knowledge",
  "  contract <issue> | --file <path> [--json]   How intake reads an issue body (exit 0 at 6/6)",
  "",
  "Repository:",
  "  labels sync [--apply]           Print the agent:* label commands; --apply runs them",
  "  doctor [--json] [--probe]       Check the environment. --probe also runs the Docker isolation probes",
  "  docker build|login|doctor|status|prune ...   Docker isolation (run 'pnpm desk docker' for details)",
  "  serve [--port <n>] [--no-open]  Start the local server and print its URL",
  "",
  "The driving commands also take --json (print one JSON result) and --no-writeback.",
  "Exit codes: 0 at a gate or done, 1 needs you, refused or failed, 2 usage error.",
  "serve exits 0 on Ctrl-C.",
  "State lives in <git-common-dir>/kaine-desk and is never committed."
].join("\n");

/** Ask on the terminal. Only used when both input and output are a TTY. */
const askOnTerminal = async (question: string): Promise<boolean> => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await terminal.question(question)).trim());
  } finally {
    terminal.close();
  }
};

/** Run a command with the terminal attached, for a login. Resolves with the exit code. */
const runInteractive = (argv: readonly string[]): Promise<number> =>
  new Promise((resolve) => {
    const [command, ...args] = argv;
    if (command === undefined) {
      resolve(1);
      return;
    }
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });

export const createDefaultDeps = (): CliDeps => {
  const exec = createExec();
  return {
    exec,
    clock: systemClock,
    cwd: process.cwd(),
    nodeVersion: process.version,
    createGitHub: (cwd) => createGitHubPort({ exec, cwd }),
    git: createGitPort(exec),
    runnerFor: (provider) => (provider === "claude" ? createClaudeRunner() : createCodexRunner()),
    docker: {
      // A patch comes back as base64 on stdout, so the cap is well above the largest patch.
      exec: createExec({ maxOutputBytes: 64 * 1024 * 1024 }),
      process: createAgentProcess(),
      interactive: runInteractive
    },
    ask: process.stdin.isTTY && process.stdout.isTTY ? askOnTerminal : undefined
  };
};

const COMMANDS: Readonly<Record<string, CliCommand>> = {
  start: commandStart,
  approve: commandApprove,
  feedback: commandFeedback,
  continue: commandContinue,
  cancel: commandCancel,
  remove: commandRemove,
  draft: commandDraft,
  ship: commandShip,
  refresh: commandRefresh,
  status: commandStatus,
  logs: commandLogs,
  resume: commandResume,
  stats: commandStats,
  lessons: commandLessons,
  contract: commandContract,
  labels: commandLabels,
  doctor: commandDoctor,
  docker: commandDocker,
  serve: commandServe
};

export const runCli = async (
  argv: readonly string[],
  deps: CliDeps = createDefaultDeps()
): Promise<CliResult> => {
  // `pnpm desk -- <args>` can pass a leading `--`. A later `--` belongs to the command.
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const [command, ...rest] = args;

  let stdout = "";
  let stderr = "";
  const io: CliIo = deps.live ?? {
    out: (text) => {
      stdout += text;
    },
    err: (text) => {
      stderr += text;
    }
  };
  const result = (code: number): CliResult => ({ code, stdout, stderr });

  if (command === undefined || command === "--help" || command === "-h") {
    io.out(`${USAGE}\n`);
    return result(0);
  }
  const handler = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (handler === undefined) {
    io.err(`Unknown command '${command}'.\n\n${USAGE}\n`);
    return result(2);
  }

  try {
    return result(await handler(rest, deps, io));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (error instanceof UsageError) io.err(`${message}\n\n${USAGE}\n`);
    else io.err(`Error: ${message}\n`);
    return result(error instanceof UsageError ? 2 : 1);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  // Ctrl-C ends `logs --follow`. Other commands keep Node's default: the issue
  // stays `running`, and the next command recovers it into `needs-you`.
  const controller = new AbortController();
  if (argv.includes("logs")) process.once("SIGINT", () => controller.abort());
  void runCli(argv, {
    ...createDefaultDeps(),
    live: {
      out: (text) => void process.stdout.write(text),
      err: (text) => void process.stderr.write(text)
    },
    signal: controller.signal
  }).then((result) => {
    process.exitCode = result.code;
  });
}
