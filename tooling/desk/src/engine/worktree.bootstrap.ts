import path from "node:path";
import { z } from "zod";

import { CONVENTIONAL_TYPES, PROVIDERS, type ConventionalType, type Provider } from "../contracts";

/**
 * The worktree setup recipe as pure data. `bootstrapPlan` returns the ordered
 * argv steps and runs nothing: the executor arrives in a later phase. Every
 * step is an argv array, so there is no shell to inject into.
 */

export type BranchName = string;

/** `KAINE-<issue>-<type>-<slug>`, as AGENTS.md and CONTRIBUTING.md define it. */
const BRANCH_PATTERN = new RegExp(`^KAINE-(\\d+-)?(${CONVENTIONAL_TYPES.join("|")})-[a-z0-9-]+$`);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_PATTERN = /^kaine-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MCP_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 40;

export const isValidBranchName = (name: string): name is BranchName => BRANCH_PATTERN.test(name);

/** Lower-case, hyphen-separated slug from free text such as an issue title. */
export const slugify = (text: string): string => {
  const slug = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? "work" : slug;
};

export interface BranchInput {
  readonly issue: number;
  readonly type: ConventionalType;
  readonly slug: string;
}

export const branchName = ({ issue, type, slug }: BranchInput): BranchName => {
  if (!Number.isSafeInteger(issue) || issue <= 0) {
    throw new RangeError(`Issue number must be a positive integer, got ${issue}`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new RangeError(`Branch slug must be lower-case words joined by hyphens, got '${slug}'`);
  }
  const name = `KAINE-${issue}-${type}-${slug}`;
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
  intake: ["kaine-intake"],
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

/** Union of the skills for `roles` plus `extras`, de-duplicated and sorted. */
export const skillsForRoles = (
  roles: readonly DeskRole[],
  extras: readonly string[] = []
): string[] => [...new Set([...roles.flatMap((role) => ROLE_SKILLS[role]), ...extras])].sort();

export type StepCwd = "repo" | "worktree";

/** What a finished step must show. The executor checks it with `evaluateStep`. */
export type StepExpectation =
  | { readonly kind: "exit-zero" }
  | { readonly kind: "stdout-empty" }
  | { readonly kind: "installation-ready" }
  /** The trimmed stdout is a value the run keeps, such as the base commit. */
  | { readonly kind: "record"; readonly as: "baseHead" };

export interface BootstrapStep {
  readonly id: string;
  readonly argv: readonly string[];
  readonly cwd: StepCwd;
  readonly expect: StepExpectation;
}

export interface BootstrapInput {
  readonly issue: number;
  readonly type: ConventionalType;
  readonly slug: string;
  /** Base branch on `origin`. */
  readonly base: string;
  /** Absolute path of the new worktree. */
  readonly worktreeDir: string;
  readonly agents: readonly Provider[];
  readonly skills: readonly string[];
  readonly mcp: readonly string[];
  /** The branch already exists (a removed worktree kept it): check it out instead of creating it. */
  readonly existingBranch?: boolean;
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

export const bootstrapPlan = (input: BootstrapInput): BootstrapPlan => {
  const branch = branchName(input);
  const { base, worktreeDir } = input;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base) || base.includes("..")) {
    throw new RangeError(`Invalid base branch '${base}'`);
  }
  if (!path.isAbsolute(worktreeDir)) {
    throw new RangeError(`Worktree directory must be an absolute path, got '${worktreeDir}'`);
  }
  if (input.agents.length === 0) throw new RangeError("Bootstrap needs at least one agent");
  const agents = input.agents.map((agent) => providerSchema.parse(agent));
  assertAll("skill", input.skills, SKILL_PATTERN);
  assertAll("MCP server", input.mcp, MCP_PATTERN);

  const installArgv = ["pnpm", "ai:install"];
  for (const agent of agents) installArgv.push("--agent", agent);
  installArgv.push("--non-interactive");
  if (input.skills.length > 0) installArgv.push("--skill", input.skills.join(","));
  if (input.mcp.length > 0) installArgv.push("--mcp", input.mcp.join(","));

  const steps: BootstrapStep[] = [
    {
      id: "check-branch",
      argv: ["git", "check-ref-format", "--branch", branch],
      cwd: "repo",
      expect: { kind: "exit-zero" }
    },
    {
      id: "fetch-base",
      argv: ["git", "fetch", "origin", base],
      cwd: "repo",
      expect: { kind: "exit-zero" }
    },
    {
      id: "worktree-add",
      argv:
        input.existingBranch === true
          ? ["git", "worktree", "add", worktreeDir, branch]
          : ["git", "worktree", "add", "-b", branch, worktreeDir, `origin/${base}`],
      cwd: "repo",
      expect: { kind: "exit-zero" }
    },
    {
      id: "install",
      argv: ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"],
      cwd: "worktree",
      expect: { kind: "exit-zero" }
    },
    {
      id: "env-ensure",
      argv: ["pnpm", "env:ensure"],
      cwd: "worktree",
      expect: { kind: "exit-zero" }
    },
    { id: "ai-install", argv: installArgv, cwd: "worktree", expect: { kind: "exit-zero" } },
    ...agents.map((agent): BootstrapStep => ({
      id: `ai-doctor-${agent}`,
      argv: ["pnpm", "ai:doctor", "--agent", agent, "--local", "--json"],
      cwd: "worktree",
      expect: { kind: "installation-ready" }
    })),
    {
      id: "baseline-status",
      argv: ["git", "status", "--short"],
      cwd: "worktree",
      expect: { kind: "stdout-empty" }
    },
    {
      id: "base-head",
      argv: ["git", "rev-parse", "HEAD"],
      cwd: "worktree",
      expect: { kind: "record", as: "baseHead" }
    }
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

export type StepVerdict =
  | { readonly ok: true; readonly recorded?: { readonly baseHead: string } }
  | { readonly ok: false; readonly reason: string };

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
    case "stdout-empty":
      return result.stdout.trim() === ""
        ? { ok: true }
        : { ok: false, reason: `${step.id}: the fresh worktree is not clean` };
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
    case "record": {
      const head = result.stdout.trim();
      return /^[0-9a-f]{40}$/.test(head)
        ? { ok: true, recorded: { baseHead: head } }
        : { ok: false, reason: `${step.id} did not print a commit hash` };
    }
  }
};
