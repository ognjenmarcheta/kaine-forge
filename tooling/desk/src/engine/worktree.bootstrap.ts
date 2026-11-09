import path from "node:path";
import { z } from "zod";

import {
  PROVIDERS,
  type AgentDefinition,
  type ConventionalType,
  type InstalledCapabilities,
  type Provider
} from "../contracts";
import { isGitBranchName, isValidBranchName, type BranchName } from "../git";

/**
 * The worktree setup recipe as pure data. `bootstrapPlan` returns the branch and the ordered
 * argv steps that run in the new worktree, and runs nothing. Every step is an argv array, so
 * there is no shell to inject into. The git work around them (check the branch name, fetch
 * the base, add the worktree, then require a clean tree and read the base commit) goes through
 * `GitPort` in `createWorktree`.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_PATTERN = /^kaine-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MCP_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 40;

/** Lower-case, hyphen-separated slug from free text such as an issue title. */
export const slugify = (text: string): string => {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    // The step above leaves no runs of "-", so single-dash anchors suffice and stay linear.
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "");
  return slug === "" ? "work" : slug;
};

export interface BranchInput {
  /** `null` for a desk job, which has no GitHub issue: `KAINE-<type>-<slug>` (AGENTS.md). */
  readonly issue: number | null;
  readonly type: ConventionalType;
  readonly slug: string;
}

export const branchName = ({ issue, type, slug }: BranchInput): BranchName => {
  if (issue !== null && (!Number.isSafeInteger(issue) || issue <= 0)) {
    throw new RangeError(`Issue number must be a positive integer, got ${issue}`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new RangeError(`Branch slug must be lower-case words joined by hyphens, got '${slug}'`);
  }
  const name = issue === null ? `KAINE-${type}-${slug}` : `KAINE-${issue}-${type}-${slug}`;
  if (!isValidBranchName(name)) throw new RangeError(`Invalid branch name '${name}'`);
  return name;
};

export const DESK_ROLES = ["intake", "planner", "builder", "reviewer"] as const;
export type DeskRole = (typeof DESK_ROLES)[number];

/**
 * Skills each role gets. A listed subset is exact: `ai:install` removes every
 * other skill. Ops skills are never listed.
 */
export const ROLE_SKILLS: Readonly<Record<DeskRole, readonly string[]>> = {
  intake: ["kaine-intake", "kaine-write-issue"],
  planner: ["kaine-write-plan"],
  builder: ["kaine-test"],
  reviewer: ["kaine-review"]
};

/** Extra skills a role gets only when the work calls for them. */
export const OPTIONAL_ROLE_SKILLS = {
  /** Organization-scoped CRUD features only. */
  builder: ["kaine-create-feature"],
  /** An optional second review pass. */
  reviewer: ["kaine-simplify"]
} as const satisfies Partial<Record<DeskRole, readonly string[]>>;

/**
 * What a worktree installs for the agents of a flow: the union of their MCP servers (in the
 * order the agents name them) and their skills (sorted), limited to what the checkout
 * installed. A run drops what is not installed and records why, so setup does not fail on it.
 */
export const installsForAgents = (
  agents: readonly Pick<AgentDefinition, "capabilities">[],
  installed: InstalledCapabilities
): { readonly mcp: string[]; readonly skills: string[] } => ({
  mcp: [...new Set(agents.flatMap((agent) => agent.capabilities.mcp))].filter((server) =>
    installed.mcp.includes(server)
  ),
  skills: [...new Set(agents.flatMap((agent) => agent.capabilities.skills))]
    .filter((skill) => installed.skills.includes(skill))
    .sort()
});

/** What a finished step must show. The executor checks it with `evaluateStep`. */
export type StepExpectation =
  { readonly kind: "exit-zero" } | { readonly kind: "installation-ready" };

/** One step of the recipe. It runs in the new worktree. */
export interface BootstrapStep {
  readonly id: string;
  readonly argv: readonly string[];
  readonly expect: StepExpectation;
}

export interface BootstrapInput {
  readonly issue: number | null;
  readonly type: ConventionalType;
  readonly slug: string;
  /** Base branch on `origin`. */
  readonly base: string;
  /** Absolute path of the new worktree. */
  readonly worktreeDir: string;
  readonly agents: readonly Provider[];
  readonly skills: readonly string[];
  readonly mcp: readonly string[];
}

export interface BootstrapPlan {
  readonly branch: BranchName;
  readonly steps: readonly BootstrapStep[];
}

const providerSchema = z.enum(PROVIDERS);

const assertAll = (what: string, values: readonly string[], pattern: RegExp): void => {
  for (const value of values) {
    if (!pattern.test(value)) throw new RangeError(`Invalid ${what} '${value}'`);
  }
};

/**
 * The `ai:install` command of an issue worktree. Setup runs it, and the engine runs it again after
 * a change to the `.ai/` sources, so the tracked generated files follow and local installs stay.
 */
export const aiInstallArgv = (
  input: Pick<BootstrapInput, "agents" | "skills" | "mcp">
): string[] => {
  const argv = ["pnpm", "ai:install"];
  for (const agent of input.agents) argv.push("--agent", agent);
  argv.push("--non-interactive");
  if (input.skills.length > 0) argv.push("--skill", input.skills.join(","));
  if (input.mcp.length > 0) argv.push("--mcp", input.mcp.join(","));
  // REPL code runs arbitrary Python, past the role allowlists. Desk runs keep one tool per operation.
  if (input.mcp.includes("serena")) argv.push("--serena-interface", "tools");
  return argv;
};

export const bootstrapPlan = (input: BootstrapInput): BootstrapPlan => {
  const branch = branchName(input);
  const { base, worktreeDir } = input;
  if (!isGitBranchName(base)) {
    throw new RangeError(`Invalid base branch '${base}'`);
  }
  if (!path.isAbsolute(worktreeDir)) {
    throw new RangeError(`Worktree directory must be an absolute path, got '${worktreeDir}'`);
  }
  if (input.agents.length === 0) throw new RangeError("Bootstrap needs at least one agent");
  const agents = input.agents.map((agent) => providerSchema.parse(agent));
  assertAll("skill", input.skills, SKILL_PATTERN);
  assertAll("MCP server", input.mcp, MCP_PATTERN);

  const installArgv = aiInstallArgv({ agents, skills: input.skills, mcp: input.mcp });

  const steps: BootstrapStep[] = [
    {
      id: "install",
      argv: ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"],
      expect: { kind: "exit-zero" }
    },
    {
      id: "env-ensure",
      argv: ["pnpm", "env:ensure"],
      expect: { kind: "exit-zero" }
    },
    { id: "ai-install", argv: installArgv, expect: { kind: "exit-zero" } },
    ...agents.map((agent): BootstrapStep => ({
      id: `ai-doctor-${agent}`,
      argv: ["pnpm", "ai:doctor", "--agent", agent, "--local", "--json"],
      expect: { kind: "installation-ready" }
    }))
  ];
  return { branch, steps };
};

const readinessSchema = z.object({ installation: z.string() });

/**
 * `pnpm <script>` prints a `> pkg script` banner on stdout before the script's
 * own output, so the JSON report starts at the first line that begins with `{`.
 */
const jsonReport = (stdout: string): string => {
  const start = stdout.search(/^\{/m);
  return start === -1 ? stdout : stdout.slice(start);
};

export type StepVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Judge one finished step against its expectation. Pure: the caller supplies the result. */
export const evaluateStep = (
  step: Pick<BootstrapStep, "id" | "expect">,
  result: { readonly code: number | null; readonly stdout: string }
): StepVerdict => {
  if (result.code !== 0) {
    return { ok: false, reason: `${step.id} exited with ${result.code ?? "no exit code"}` };
  }
  switch (step.expect.kind) {
    case "exit-zero":
      return { ok: true };
    case "installation-ready": {
      let json: unknown;
      try {
        json = JSON.parse(jsonReport(result.stdout));
      } catch {
        return { ok: false, reason: `${step.id} printed output that is not JSON` };
      }
      const report = readinessSchema.safeParse(json);
      if (!report.success) return { ok: false, reason: `${step.id} printed an unexpected report` };
      return report.data.installation === "ready"
        ? { ok: true }
        : { ok: false, reason: `${step.id}: installation is ${report.data.installation}` };
    }
  }
};
