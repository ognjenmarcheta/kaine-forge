import type { AgentPermissions } from "../agents/agent.runner";
import { toAgentPermissions } from "../agents/capabilities.resolve";
import { bash } from "../agents/permissions";
import {
  LAB_SCREEN_ID,
  UI_COMPONENT_NAME,
  type CapabilityProfile,
  type ComponentSpec,
  type JobKind,
  type JobState
} from "../contracts";

/**
 * What a job agent may do beyond a read-only desk agent. Subagents are allowed: under
 * `dontAsk` a subagent inherits the session's allow and deny rules, so it can do no more than
 * the job itself (checked against claude 2.1.309: a subagent's Bash call outside the allowlist
 * is denied). Claude names the tool `Agent`; `Task` is its older name.
 */
export const JOB_SUBAGENT_TOOLS = ["Agent", "Task"] as const;

/** The skills each job kind preloads. The engine installs exactly these in the job worktree. */
export const JOB_SKILLS: Readonly<Record<JobKind, readonly string[]>> = {
  scorecard: ["kaine-scorecard", "kaine-review", "kaine-write-issue"],
  screen: ["kaine-build-ui", "kaine-audit-ui"],
  component: ["kaine-build-ui", "kaine-test", "kaine-audit-ui"],
  audit: ["kaine-audit-ui", "kaine-write-issue"],
  // A role job takes its agent's own skills (`jobSkills`).
  role: []
};

/** The MCP servers each job kind gets, when the checkout installed them. */
export const JOB_MCP: Readonly<Record<JobKind, readonly string[]>> = {
  scorecard: ["serena"],
  // The browser: the builder looks at its screen and the compare view in the job's lab server.
  screen: ["serena", "playwright"],
  // The browser: the builder looks at its specimen, the auditor at the screen, in the lab server.
  component: ["serena", "playwright"],
  audit: ["serena", "playwright"],
  // A role job takes its agent's own servers (`jobMcp`).
  role: []
};

/**
 * Commands a job agent may run, exact as in `run-checks`. The scorecard job runs none: the
 * engine runs the sweep, writes the ledger, and renders it.
 */
export const JOB_COMMANDS: Readonly<Record<JobKind, readonly string[]>> = {
  scorecard: [],
  screen: [
    "pnpm lab:diff",
    "pnpm lab:shots",
    "pnpm --filter @repo/desk-ui test",
    "pnpm --filter @repo/desk-ui lint",
    "pnpm --filter @repo/desk-ui typecheck",
    "pnpm ui:check"
  ],
  component: [
    "pnpm --filter @repo/ui test",
    "pnpm --filter @repo/ui lint",
    "pnpm --filter @repo/ui typecheck",
    "pnpm --filter @repo/desk-ui typecheck",
    "pnpm ui:check",
    "pnpm theme:check"
  ],
  audit: ["pnpm lab:diff", "pnpm lab:shots", "pnpm ui:check"],
  // A role job reads: its agent runs under the read-only floor, whatever its preset.
  role: []
};

/** The skills a job preloads: its kind's list, or a role job's agent's own skills. */
export const jobSkills = (job: Pick<JobState, "kind" | "role">): readonly string[] =>
  job.kind === "role" ? (job.role?.agent.skills ?? []) : JOB_SKILLS[job.kind];

/** The MCP servers a job asks for: its kind's list, or a role job's agent's own servers. */
export const jobMcp = (job: Pick<JobState, "kind" | "role">): readonly string[] =>
  job.kind === "role" ? (job.role?.agent.mcp ?? []) : JOB_MCP[job.kind];

/** The folder a screen job writes, relative to the worktree. */
export const screenFolder = (screenId: string): string => {
  if (!LAB_SCREEN_ID.test(screenId)) throw new RangeError(`Invalid lab screen id '${screenId}'`);
  return `tooling/desk-ui/src/lab/screens/${screenId}`;
};

/** `RatingStars` → `rating-stars`: the file name of a `@repo/ui` component. */
export const componentFileName = (name: string): string => {
  if (!UI_COMPONENT_NAME.test(name)) throw new RangeError(`Invalid component name '${name}'`);
  return name.replace(/(?<!^)([A-Z])/g, "-$1").toLowerCase();
};

/**
 * The files a component job writes, relative to the worktree: the component, its test, the
 * package index that exports it, its lab specimen, and the design system's option list. The
 * engine writes the changeset itself.
 */
export const componentFiles = (component: ComponentSpec): readonly string[] => {
  const file = componentFileName(component.name);
  const folder = `packages/ui/src/components/${component.layer}`;
  return [
    `${folder}/${file}.tsx`,
    `${folder}/${file}.test.tsx`,
    "packages/ui/src/index.ts",
    `tooling/desk-ui/src/lab/specimens/${file}.specimen.tsx`,
    "DESIGN_SYSTEM.md"
  ];
};

/** The `Edit` rule for each path. An `Edit` rule covers `Write` too. */
export const editRules = (paths: readonly string[]): string[] =>
  paths.map((entry) => `Edit(${entry})`);

/**
 * The runner permissions of a job: the read-only profile (with the whole policy floor in its
 * deny list), plus subagents, the kind's own commands, and the paths this step may write (a
 * screen job its folder, a component build its files; a plan or an audit nothing).
 */
export const jobPermissions = (
  profile: CapabilityProfile,
  kind: JobKind,
  writes: readonly string[] = []
): AgentPermissions => {
  const base = toAgentPermissions(profile);
  return {
    allow: [
      ...base.allow,
      ...JOB_SUBAGENT_TOOLS,
      ...JOB_COMMANDS[kind].map(bash),
      ...editRules(writes)
    ],
    disallow: base.disallow
  };
};
