import { z } from "zod";

import type { Exec } from "../ports";

/**
 * The machine checks of a scorecard run, which the engine runs itself so the agent needs no
 * `gh` and no token: the repo gates, then the GitHub state through the desk's own `gh` login.
 * Each result keeps the exit code and a bounded output. A failing command is a fact for the
 * scorer, not a failed job.
 */

export interface SweepStep {
  readonly id: string;
  readonly argv: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

const MINUTE = 60_000;
/** knip loads configs that read `DATABASE_URL`; a loopback address keeps it local. */
const LOOPBACK_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/scorecard";
const GH_ENV = { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" };

export const SCORECARD_SWEEP: readonly SweepStep[] = [
  { id: "boundaries", argv: ["pnpm", "boundaries"], timeoutMs: 5 * MINUTE },
  {
    id: "knip",
    argv: ["pnpm", "knip"],
    env: { DATABASE_URL: LOOPBACK_DATABASE_URL },
    timeoutMs: 5 * MINUTE
  },
  { id: "audit", argv: ["pnpm", "audit", "--audit-level", "high"], timeoutMs: 3 * MINUTE },
  { id: "ai-doctor", argv: ["pnpm", "ai:doctor", "--strict"], timeoutMs: 3 * MINUTE },
  {
    id: "runs-main",
    argv: [
      "gh",
      "run",
      "list",
      "--branch",
      "main",
      "--limit",
      "40",
      "--json",
      "workflowName,conclusion,headSha,createdAt,updatedAt,databaseId,event"
    ],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "runs-ci-pr",
    argv: [
      "gh",
      "run",
      "list",
      "--workflow",
      "CI PR",
      "--limit",
      "15",
      "--json",
      "conclusion,headBranch,createdAt,updatedAt,databaseId"
    ],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "code-scanning",
    argv: ["gh", "api", "repos/{owner}/{repo}/code-scanning/alerts?state=open&per_page=100"],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "dependabot",
    argv: ["gh", "api", "repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100"],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "rulesets",
    argv: ["gh", "api", "repos/{owner}/{repo}/rulesets"],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "issues",
    argv: [
      "gh",
      "issue",
      "list",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,state"
    ],
    env: GH_ENV,
    timeoutMs: MINUTE
  },
  {
    id: "open-prs",
    argv: ["gh", "pr", "list", "--state", "open", "--json", "number,title,author"],
    env: GH_ENV,
    timeoutMs: MINUTE
  }
];

/** Most of one result the scorer reads. JSON lists stay whole up to this size. */
const MAX_OUTPUT_CHARS = 60_000;

export const sweepResultSchema = z
  .object({
    id: z.string(),
    argv: z.array(z.string()),
    code: z.number().int().nullable(),
    timedOut: z.boolean(),
    truncated: z.boolean(),
    output: z.string()
  })
  .strict();
export type SweepResult = z.infer<typeof sweepResultSchema>;

export const sweepSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    head: z.string(),
    results: z.array(sweepResultSchema),
    /** The coverage totals of the latest green CI PR run, or why they are missing. */
    coverage: z.string()
  })
  .strict();
export type Sweep = z.infer<typeof sweepSchema>;

const bounded = (text: string): { output: string; truncated: boolean } =>
  text.length <= MAX_OUTPUT_CHARS
    ? { output: text, truncated: false }
    : { output: `${text.slice(0, MAX_OUTPUT_CHARS)}\n[truncated]`, truncated: true };

/** The vitest coverage lines of a job log: the totals and the test counts. */
export const coverageLines = (log: string): string =>
  log
    .split("\n")
    .map((line) => line.replace(/^\S+Z\s/, "").trim())
    .filter((line) => /^(All files|Test Files|Tests)\b/.test(line))
    .join("\n");

const runListSchema = z.array(z.object({ databaseId: z.number(), conclusion: z.string() }));
const runJobsSchema = z.object({
  jobs: z.array(z.object({ name: z.string(), databaseId: z.number() }))
});

/**
 * The coverage totals of the latest green CI PR run. CI measures coverage, so the scorer reads
 * it from there instead of running the whole suite again.
 */
const latestCoverage = async (exec: Exec, cwd: string): Promise<string> => {
  const gh = async (argv: readonly string[]): Promise<string | null> => {
    const result = await exec({ argv: ["gh", ...argv], cwd, env: GH_ENV, timeoutMs: 60_000 });
    return result.code === 0 ? result.stdout : null;
  };
  const listed = await gh([
    "run",
    "list",
    "--workflow",
    "CI PR",
    "--status",
    "success",
    "--limit",
    "1",
    "--json",
    "databaseId,conclusion"
  ]);
  const run = listed === null ? undefined : runListSchema.safeParse(JSON.parse(listed)).data?.[0];
  if (run === undefined) return "No green CI PR run found.";
  const jobs = await gh(["run", "view", String(run.databaseId), "--json", "jobs"]);
  const job =
    jobs === null
      ? undefined
      : runJobsSchema
          .safeParse(JSON.parse(jobs))
          .data?.jobs.find((entry) => entry.name === "Coverage Threshold");
  if (job === undefined) return `CI PR run ${run.databaseId} has no Coverage Threshold job.`;
  const log = await gh(["api", `repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`]);
  if (log === null) return `The log of job ${job.databaseId} could not be read.`;
  const lines = coverageLines(log);
  return lines === ""
    ? `Job ${job.databaseId} logged no coverage totals.`
    : `CI PR run ${run.databaseId}, job ${job.databaseId}:\n${lines}`;
};

/** Run every step in `cwd`, then read the coverage. Never throws for a failing command. */
export const runSweep = async (
  exec: Exec,
  cwd: string,
  head: string,
  now: () => Date,
  steps: readonly SweepStep[] = SCORECARD_SWEEP
): Promise<Sweep> => {
  const results: SweepResult[] = [];
  for (const step of steps) {
    const result = await exec({
      argv: step.argv,
      cwd,
      env: { NO_COLOR: "1", ...step.env },
      timeoutMs: step.timeoutMs
    });
    const text = [result.stdout, result.stderr].filter((part) => part.trim() !== "").join("\n");
    results.push({
      id: step.id,
      argv: [...step.argv],
      code: result.code,
      timedOut: result.timedOut,
      ...bounded(text)
    });
  }
  let coverage: string;
  try {
    coverage = await latestCoverage(exec, cwd);
  } catch (error) {
    coverage = `Coverage could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
  return { generatedAt: now().toISOString(), head, results, coverage };
};
