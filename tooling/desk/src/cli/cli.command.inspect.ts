import { stat } from "node:fs/promises";

import { loadDeskConfig } from "../config/config.load";
import type { IssueState, Provider } from "../contracts";
import { parse, requireIssue } from "./cli.args";
import { formatState, nextSteps } from "./cli.format";
import { UsageError, type CliCommand } from "./cli.types";
import { needsYouReason } from "../engine/pipeline.state";
import { followLog, readLogLines } from "../log/log.read";
import { formatLogRecord, parseLogLine } from "../log/log.record";
import { createIssueStore, type IssueReadResult } from "../store/store.issue";
import { configPath, resolveRepoLocation } from "../store/store.root";

/** Read-only commands: `status`, `logs`, and `resume`. They take no lease and change nothing. */

const DEFAULT_FOLLOW_MS = 500;

export type StatusJsonEntry =
  | {
      readonly issue: number;
      readonly status: "ok";
      readonly state: IssueState;
      readonly needsYouReason: string | null;
      readonly next: readonly string[];
    }
  | { readonly issue: number; readonly status: "missing" }
  | {
      readonly issue: number;
      readonly status: "unreadable";
      readonly reason: string;
      readonly detail: string;
    };

const jsonEntry = (issue: number, result: IssueReadResult): StatusJsonEntry => {
  if (result.status === "ok") {
    return {
      issue,
      status: "ok",
      state: result.state,
      needsYouReason: needsYouReason(result.state),
      next: nextSteps(result.state)
    };
  }
  if (result.status === "missing") return { issue, status: "missing" };
  return { issue, status: "unreadable", reason: result.reason, detail: result.detail };
};

const summaryLine = (issue: number, result: IssueReadResult): string => {
  if (result.status === "missing") return `#${issue}: no desk state`;
  if (result.status === "unreadable") {
    return `#${issue}: unreadable (${result.reason}): ${result.detail}`;
  }
  const reason = needsYouReason(result.state);
  const brief = reason === null ? "" : ` - ${reason.split("\n", 1)[0] ?? ""}`;
  return `#${issue}: ${result.state.stage} (${result.state.status})${brief}`;
};

export const commandStatus: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, { json: { type: "boolean" } });
  if (positionals.length > 1) {
    throw new UsageError("Usage: pnpm desk status [issue] [--json]");
  }
  const { stateRoot } = await resolveRepoLocation(deps.exec, deps.cwd);
  const store = createIssueStore(stateRoot);
  const json = values.json === true;

  if (positionals.length === 1) {
    const issue = requireIssue(positionals, "pnpm desk status [issue] [--json]");
    const result = await store.read(issue);
    if (json) io.out(`${JSON.stringify({ issues: [jsonEntry(issue, result)] }, null, 2)}\n`);
    else {
      io.out(
        `${(result.status === "ok" ? formatState(result.state) : [summaryLine(issue, result)]).join("\n")}\n`
      );
    }
    return result.status === "ok" ? 0 : 1;
  }

  const entries = await store.list();
  if (json) {
    const issues = entries.map((entry) => jsonEntry(entry.issueNumber, entry.result));
    io.out(`${JSON.stringify({ issues }, null, 2)}\n`);
  } else if (entries.length === 0) {
    io.out("No desk issues yet.\n");
  } else {
    io.out(`${entries.map((entry) => summaryLine(entry.issueNumber, entry.result)).join("\n")}\n`);
  }
  return 0;
};

export const commandLogs: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    follow: { type: "boolean" },
    json: { type: "boolean" }
  });
  const issue = requireIssue(positionals, "pnpm desk logs <issue> [--follow] [--json]");
  const { stateRoot } = await resolveRepoLocation(deps.exec, deps.cwd);
  const store = createIssueStore(stateRoot);
  const json = values.json === true;

  const state = await store.read(issue);
  if (state.status === "missing") {
    io.err(`#${issue} has no desk state. Run 'pnpm desk start ${issue}' first.\n`);
    return 1;
  }

  const print = (lines: readonly string[]): void => {
    for (const line of lines) {
      if (json) {
        io.out(`${line}\n`);
        continue;
      }
      const record = parseLogLine(line);
      // A line that does not parse is damage, not data. Say so and go on.
      io.out(`${record === null ? "(unreadable log line skipped)" : formatLogRecord(record)}\n`);
    }
  };

  const { lines, offset } = await readLogLines(store, issue);
  if (lines.length === 0 && !json && values.follow !== true) {
    io.out(`#${issue}: no log yet. The log starts when a stage runs.\n`);
    return 0;
  }
  print(lines);
  if (values.follow === true) {
    await followLog({
      store,
      issue,
      offset,
      onLines: print,
      signal: deps.signal ?? new AbortController().signal,
      intervalMs: deps.followIntervalMs ?? DEFAULT_FOLLOW_MS
    });
  }
  return 0;
};

/** A path that is safe to paste after `cd`. */
const shellQuote = (value: string): string =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;

const resumeCommand = (provider: Provider, sessionId: string): string =>
  provider === "claude" ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`;

const isDirectory = async (target: string): Promise<boolean> => {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
};

export const commandResume: CliCommand = async (args, deps, io) => {
  const { positionals } = parse(args, {});
  const issue = requireIssue(positionals, "pnpm desk resume <issue>");
  const location = await resolveRepoLocation(deps.exec, deps.cwd);
  const read = await createIssueStore(location.stateRoot).read(issue);

  if (read.status !== "ok") {
    io.err(
      read.status === "missing"
        ? `#${issue} has no desk state. Run 'pnpm desk start ${issue}' first.\n`
        : `State for #${issue} is unreadable (${read.reason}): ${read.detail}\n`
    );
    return 1;
  }
  const { state } = read;
  const worktree = state.worktreePath;
  if (worktree === null) {
    io.err(`#${issue} has no worktree yet. The setup stage creates it.\n`);
    return 1;
  }
  if (!(await isDirectory(worktree))) {
    io.err(`The worktree of #${issue} is gone: ${worktree}\n`);
    return 1;
  }
  const sessions = [
    { role: "builder", id: state.sessions.builder },
    { role: "planner", id: state.sessions.planner }
  ] as const;
  const known = sessions.flatMap(({ role, id }) => (id === undefined ? [] : [{ role, id }]));
  if (known.length === 0) {
    io.err(`#${issue} has no agent session yet. A session exists after the planner has run.\n`);
    return 1;
  }

  const loaded = await loadDeskConfig(configPath(location.repoRoot));
  if (!loaded.ok) {
    io.err(`Config error (${loaded.reason}): ${loaded.detail}\n`);
    return 1;
  }
  const lines = [`#${issue}: resume an agent session by hand.`];
  for (const { role, id } of known) {
    const provider = loaded.config.providers[role];
    lines.push(
      `  ${role} (${provider}): cd ${shellQuote(worktree)} && ${resumeCommand(provider, id)}`
    );
  }
  lines.push(
    "Stop every desk run for this issue first, and close your session before the next one."
  );
  io.out(`${lines.join("\n")}\n`);
  return 0;
};
