import type { AgentPermissions } from "../agents/agent.runner";
import { toAgentPermissions } from "../agents/capabilities.resolve";
import { bash } from "../agents/permissions";
import { LAB_SCREEN_ID, type CapabilityProfile, type JobKind } from "../contracts";

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
  screen: ["kaine-build-ui", "kaine-audit-ui"]
};

/** The MCP servers each job kind gets, when the checkout installed them. */
export const JOB_MCP: Readonly<Record<JobKind, readonly string[]>> = {
  scorecard: ["serena"],
  // The browser: the builder looks at its screen and the compare view in the job's lab server.
  screen: ["serena", "playwright"]
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
  ]
};

/** The folder a screen job writes, relative to the worktree. */
export const screenFolder = (screenId: string): string => {
  if (!LAB_SCREEN_ID.test(screenId)) throw new RangeError(`Invalid lab screen id '${screenId}'`);
  return `tooling/desk-ui/src/lab/screens/${screenId}`;
};

/**
 * The runner permissions of a job: the read-only profile (with the whole policy floor in its
 * deny list), plus subagents and the kind's own commands. A screen job may also write its own
 * screen folder, and nothing else: an `Edit` rule covers `Write` too.
 */
export const jobPermissions = (
  profile: CapabilityProfile,
  kind: JobKind,
  screenId?: string
): AgentPermissions => {
  const base = toAgentPermissions(profile);
  const edits =
    kind === "screen" && screenId !== undefined ? [`Edit(${screenFolder(screenId)}/**)`] : [];
  return {
    allow: [...base.allow, ...JOB_SUBAGENT_TOOLS, ...JOB_COMMANDS[kind].map(bash), ...edits],
    disallow: base.disallow
  };
};
