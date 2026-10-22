import { z } from "zod";

import { tokenizeCommandLine } from "./command-line.contract";
import { DEFAULT_LOOP_LIMITS } from "./pipeline.contract";

export const PROVIDERS = ["claude", "codex"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

export const ISOLATIONS = ["host", "docker"] as const;
export const isolationSchema = z.enum(ISOLATIONS);
export type Isolation = z.infer<typeof isolationSchema>;

/** An argv array. The engine runs it without a shell. */
export const commandSchema = z.array(z.string().min(1)).min(1);
export type Command = z.infer<typeof commandSchema>;

/**
 * An argv array, or a command line that is cut into an argv array without a
 * shell (`tokenizeCommandLine`). Nothing expands, so `$HOME` stays text.
 */
const commandLineSchema = z.union([
  commandSchema,
  z.string().transform((line, context): string[] => {
    const tokens = tokenizeCommandLine(line);
    if (tokens.ok) return [...tokens.argv];
    context.addIssue({ code: "custom", message: tokens.reason });
    return z.NEVER;
  })
]);

/**
 * Paths a worktree must keep from its own checkout. Copying them in would
 * overwrite tracked policy or leak controller state into the agent's tree.
 */
const PROTECTED_COPY_PATHS = [
  ".git",
  ".ai",
  ".husky",
  ".claude/settings.json",
  ".ai.local/factory"
] as const;

const isWithin = (path: string, parent: string): boolean =>
  path === parent || path.startsWith(`${parent}/`);

/** A repo-relative POSIX path that stays inside the worktree and avoids protected paths. */
const copyPathSchema = z.string().superRefine((value, context) => {
  const segments = value.split("/");
  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (value === "" || value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.includes("\\")) {
    context.addIssue({ code: "custom", message: "Use a relative POSIX path" });
  } else if (segments.includes("..")) {
    context.addIssue({ code: "custom", message: "Path must stay inside the worktree" });
  } else if (normalized === "" || PROTECTED_COPY_PATHS.some((p) => isWithin(normalized, p))) {
    context.addIssue({ code: "custom", message: "Path is protected and cannot be copied" });
  }
});

const providersSchema = z
  .object({
    /** Drafts the issue format for an issue that stopped at intake (`desk draft`). */
    intake: providerSchema.default("claude"),
    planner: providerSchema.default("claude"),
    builder: providerSchema.default("claude"),
    reviewer: providerSchema.default("codex")
  })
  .strict();

const modelsSchema = z
  .object({
    intake: z.string().min(1).optional(),
    planner: z.string().min(1).optional(),
    builder: z.string().min(1).optional(),
    reviewer: z.string().min(1).optional()
  })
  .strict();

const checksSchema = z
  .object({
    /** Run after every build round. */
    loop: z.array(commandSchema).default([["pnpm", "check:affected"]]),
    /** Run once before ship. */
    ship: z.array(commandSchema).default([["pnpm", "check"]])
  })
  .strict();

/** API keys the config may pass into a container by name. Nothing else leaves the host environment. */
export const FORWARDABLE_ENV = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN"
] as const;

const resourcesSchema = (defaults: { memory: string; cpus: number; pidsLimit: number }) =>
  z
    .object({
      /** For example `6g` or `512m`. Swap is off. */
      memory: z
        .string()
        .regex(/^[1-9]\d*[mMgG]$/, "Use a size like 6g or 512m")
        .default(defaults.memory),
      cpus: z.number().positive().max(64).default(defaults.cpus),
      pidsLimit: z.number().int().min(64).max(65_536).default(defaults.pidsLimit)
    })
    .strict();

/** Limits and transfer rules for `isolation: "docker"`. */
const dockerSchema = z
  .object({
    /** The agent container. pnpm and the test runners need room. */
    agent: resourcesSchema({ memory: "6g", cpus: 4, pidsLimit: 1024 }).prefault({}),
    /** One check step container. */
    check: resourcesSchema({ memory: "6g", cpus: 4, pidsLimit: 2048 }).prefault({}),
    /** The largest patch the host accepts from a container. */
    maxPatchBytes: z
      .number()
      .int()
      .min(1024)
      .max(32 * 1024 * 1024)
      .default(8 * 1024 * 1024),
    /**
     * Host variables passed into the agent container by name. Empty by default: the container uses
     * the login in the auth volume (`pnpm desk docker login`). Only provider keys are allowed.
     */
    forwardEnv: z.array(z.enum(FORWARDABLE_ENV)).default([])
  })
  .strict();

/** The base branch when the config names none, and for an issue state from before `baseBranch`. */
export const DEFAULT_BASE_BRANCH = "main";

/** A branch name on `origin`, with the rule the Docker workspace helper applies: no option, no `..`. */
export const baseBranchSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use a branch name like main or develop")
  .refine((name) => !name.includes(".."), "A branch name cannot contain '..'");

/**
 * A flow id: the pattern of `definitionIdSchema`. It is repeated here because
 * `agent-definition.contract.ts` imports this file.
 */
const flowIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Use lowercase letters, digits and hyphens (at most 64)");

export const deskConfigSchema = z
  .object({
    /** `null` places worktrees in a sibling directory of the main checkout, named after it. */
    worktreesDir: z.string().min(1).nullable().default(null),
    /** Issue worktrees start from `origin/<baseBranch>` and PRs target it. Recorded per issue at setup. */
    baseBranch: baseBranchSchema.default(DEFAULT_BASE_BRANCH),
    copyIntoWorktree: z.array(copyPathSchema).default([]),
    checks: checksSchema.prefault({}),
    maxTestLoops: z.number().int().nonnegative().default(DEFAULT_LOOP_LIMITS.check),
    maxReviewLoops: z.number().int().nonnegative().default(DEFAULT_LOOP_LIMITS.review),
    /** PR feedback rounds from `pr-open` back to `build` before the engine asks the owner. */
    maxPrRounds: z.number().int().min(1).default(DEFAULT_LOOP_LIMITS.prRounds),
    maxConcurrentAgents: z.number().int().positive().default(2),
    providers: providersSchema.prefault({}),
    models: modelsSchema.prefault({}),
    /** Runs at a gate, a stop, and the end of a run. See "Notifications" in the manual. */
    notifyCommand: commandLineSchema.optional(),
    isolation: isolationSchema.default("host"),
    docker: dockerSchema.prefault({}),
    /** The flow `start` uses when no label of the issue is in `flowLabels` and the owner names none. */
    defaultFlow: flowIdSchema.default("kaine-default"),
    /** GitHub label to flow id. At `start`, the first label of the issue that is listed here wins. */
    flowLabels: z.record(z.string().min(1), flowIdSchema).default({}),
    /**
     * Review bots whose PR comments reach the builder in `feedback --from-pr`, although
     * GitHub gives them no trusted association. Exact GitHub App logins, for example
     * `coderabbitai[bot]`. Their text is still fenced as untrusted data.
     */
    reviewBots: z
      .array(
        z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*\[bot\]$/, "Use a bot login like name[bot]")
      )
      .default([]),
    /** GitHub login that may authorize runs. Set it explicitly for organization repositories. */
    owner: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/, "Use a GitHub login")
      .optional()
  })
  .strict();

export type DeskConfig = z.infer<typeof deskConfigSchema>;

/**
 * The flow `start` picks for an issue when the owner names none: the flow of the first issue
 * label that `flowLabels` lists, else `defaultFlow`. Pure, so the Start dialog shows the same pick.
 */
export const flowForLabels = (
  config: Pick<DeskConfig, "defaultFlow" | "flowLabels">,
  labels: readonly string[]
): string => {
  const label = labels.find((name) => Object.hasOwn(config.flowLabels, name));
  return (label === undefined ? undefined : config.flowLabels[label]) ?? config.defaultFlow;
};
