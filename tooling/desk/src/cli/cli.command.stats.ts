import { parse } from "./cli.args";
import { UsageError, type CliCommand } from "./cli.types";
import { agentStageRoleSchema, type RunGroup, type RunStats } from "../contracts";
import { aggregateRuns, snapshotsOf } from "../stats/stats.aggregate";
import { readRunRecords } from "../stats/stats.runs";
import { createIssueStore } from "../store/store.issue";
import { resolveRepoLocation } from "../store/store.root";

const USAGE = "Usage: pnpm desk stats [--role planner|builder|reviewer] [--json]";

const orDash = (value: number | null, format: (value: number) => string): string =>
  value === null ? "-" : format(value);
const whole = (value: number): string => String(Math.round(value));
const dollars = (value: number): string => `$${value.toFixed(2)}`;
const minutes = (ms: number): string => `${(ms / 60_000).toFixed(1)}m`;

/** Left-aligned columns, two spaces apart. */
const table = (rows: readonly (readonly string[])[]): string[] => {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length))
  );
  return rows.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths?.[column] ?? 0))
      .join("  ")
      .trimEnd()
  );
};

const groupRow = (group: RunGroup): string[] => [
  group.role,
  group.provider,
  group.model ?? "(default)",
  String(group.runs),
  String(group.accepted),
  String(group.stuck),
  String(group.timeouts),
  minutes(group.medianDurationMs),
  orDash(group.meanInputTokens, whole),
  orDash(group.meanOutputTokens, whole),
  orDash(group.meanTurns, whole),
  group.meanEditCalls.toFixed(1),
  orDash(group.meanCostUsd, dollars),
  orDash(group.totalCostUsd, dollars)
];

const formatStats = (stats: RunStats): string[] => {
  if (stats.groups.length === 0) return ["No agent runs recorded yet."];
  const lines = [
    "Agent runs by role, provider and model (means per run):",
    ...table([
      [
        "role",
        "provider",
        "model",
        "runs",
        "accepted",
        "stuck",
        "timeout",
        "median",
        "in tok",
        "out tok",
        "turns",
        "edits",
        "cost/run",
        "cost"
      ],
      ...stats.groups.map(groupRow)
    ]),
    "",
    "Issues:",
    ...table(
      stats.issues.map((issue) => [
        `#${issue.issue}`,
        issue.stage ?? "removed",
        issue.loops === null ? "-" : `check ${issue.loops.check} · review ${issue.loops.review}`,
        `${issue.runs} run${issue.runs === 1 ? "" : "s"}`,
        orDash(issue.totalCostUsd, dollars)
      ])
    )
  ];
  if (stats.invalidLines > 0) {
    lines.push(
      "",
      `${stats.invalidLines} line(s) of runs.jsonl could not be read and were skipped.`
    );
  }
  return lines;
};

/** Reads `runs.jsonl` and the issue states. It changes nothing. */
export const commandStats: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    json: { type: "boolean" },
    role: { type: "string" }
  });
  if (positionals.length > 0) throw new UsageError(USAGE);
  const role = values.role === undefined ? undefined : agentStageRoleSchema.safeParse(values.role);
  if (role !== undefined && !role.success) throw new UsageError(USAGE);

  const { stateRoot } = await resolveRepoLocation(deps.exec, deps.cwd);
  const read = await readRunRecords(stateRoot);
  const stats = aggregateRuns(
    role === undefined
      ? read
      : { ...read, records: read.records.filter((record) => record.role === role.data) },
    snapshotsOf(await createIssueStore(stateRoot).list())
  );

  if (values.json === true) io.out(`${JSON.stringify(stats, null, 2)}\n`);
  else io.out(`${formatStats(stats).join("\n")}\n`);
  return 0;
};
