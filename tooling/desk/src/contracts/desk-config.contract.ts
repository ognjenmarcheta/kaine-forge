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
    planner: providerSchema.default("claude"),
    builder: providerSchema.default("claude"),
    reviewer: providerSchema.default("codex")
  })
  .strict();

const modelsSchema = z
  .object({
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

export const deskConfigSchema = z
  .object({
    /** `null` places worktrees in a sibling directory named after the repository. */
    worktreesDir: z.string().min(1).nullable().default(null),
    copyIntoWorktree: z.array(copyPathSchema).default([]),
    checks: checksSchema.prefault({}),
    maxTestLoops: z.number().int().nonnegative().default(DEFAULT_LOOP_LIMITS.check),
    maxReviewLoops: z.number().int().nonnegative().default(DEFAULT_LOOP_LIMITS.review),
    maxConcurrentAgents: z.number().int().positive().default(2),
    providers: providersSchema.prefault({}),
    models: modelsSchema.prefault({}),
    /** Runs at a gate, a stop, and the end of a run. See "Notifications" in the manual. */
    notifyCommand: commandLineSchema.optional(),
    isolation: isolationSchema.default("host"),
    docker: dockerSchema.prefault({}),
    /** GitHub login that may authorize runs. Set it explicitly for organization repositories. */
    owner: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/, "Use a GitHub login")
      .optional()
  })
  .strict();

export type DeskConfig = z.infer<typeof deskConfigSchema>;
