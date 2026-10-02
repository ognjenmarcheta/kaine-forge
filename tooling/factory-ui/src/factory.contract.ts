import { z } from "zod";

export const providerSchema = z.enum(["codex", "claude"]);
export const stageSchema = z.enum(["intake", "spec", "implement", "review", "learn"]);
export const phaseSchema = z.enum([
  "preflight",
  "proposal",
  "fetch",
  "offline-install",
  "rebuild",
  "validation",
  "repair",
  "final-validation",
  "review",
  "publication",
  "cleanup"
]);
export const phaseStateSchema = z.enum([
  "started",
  "passed",
  "failed",
  "blocked",
  "cancelled",
  "skipped"
]);
export const eventSchema = z.object({
  version: z.literal(1),
  at: z.string(),
  phase: phaseSchema,
  state: phaseStateSchema,
  detail: z.string(),
  artifactId: z.string().uuid().optional()
});
export const artifactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(["image", "video", "log", "download"]),
  size: z.number()
});
const invocationSchema = z.object({
  provider: providerSchema,
  model: z.string(),
  cliVersion: z.string(),
  durationMs: z.number(),
  exitCode: z.number().nullable(),
  cleanup: z.boolean(),
  usage: z.record(z.string(), z.number())
});
export const summarySchema = z.object({
  worktreeId: z.string().optional(),
  worktree: z.string().optional(),
  waiting: z.string().nullable().optional(),
  cleanup: z
    .object({ status: z.enum(["passed", "cleanup-unverified"]), errors: z.array(z.string()) })
    .optional(),
  currentCommand: z
    .object({
      command: z.string(),
      startedAt: z.string(),
      lastOutputAt: z.string().nullable(),
      artifactId: z.string()
    })
    .nullable()
    .optional(),
  id: z.string().uuid(),
  issue: z.number(),
  stage: stageSchema,
  provider: providerSchema,
  model: z.string(),
  status: z.enum(["running", "completed", "failed", "blocked", "cancelled", "interrupted"]),
  detail: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  lastActivity: z.string().nullable(),
  phase: phaseSchema.nullable(),
  pilot: z.boolean(),
  retryOf: z.string().uuid().nullable(),
  pr: z.string().nullable(),
  revision: z.string(),
  candidate: z.string().nullable(),
  validation: z.enum(["passed", "failed", "untested"]),
  acceptance: z.enum(["accepted", "rework-required", "rejected"]).nullable(),
  reviewMinutes: z.number().nullable(),
  merge: z.enum(["open", "closed", "merged", "unavailable"])
});
export const detailSchema = summarySchema.extend({
  events: z.array(eventSchema),
  warnings: z.array(z.string()),
  artifacts: z.array(artifactSchema),
  checks: z.array(
    z.object({
      command: z.string(),
      passed: z.boolean(),
      artifactId: z.string().uuid().nullable(),
      startedAt: z.string().optional(),
      finishedAt: z.string().optional()
    })
  ),
  evidence: z.array(
    z.object({
      criterion: z.string(),
      status: z.enum(["passed", "failed", "blocked", "untested"]),
      detail: z.string()
    })
  ),
  findings: z.array(
    z.object({ path: z.string(), line: z.number(), body: z.string(), blocking: z.boolean() })
  ),
  invocations: z.array(invocationSchema)
});
export const actionRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("start"),
      issue: z.number().int().positive(),
      stage: stageSchema,
      provider: providerSchema
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("retry"),
      run: z.string().uuid()
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("cancel"),
      run: z.string().uuid()
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("doctor")
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("pilot"),
      provider: providerSchema,
      tier: z.enum(["docs", "code", "web"])
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("watch-start")
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("watch-stop")
    })
    .strict(),
  z
    .object({
      key: z.string().uuid(),
      worktreeId: z.string().optional(),
      kind: z.literal("refresh")
    })
    .strict()
]);
export const actionSchema = z.object({
  id: z.string().uuid(),
  request: actionRequestSchema,
  state: z.enum(["running", "completed", "failed", "interrupted", "cleanup-unverified"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  runId: z.string().uuid().nullable(),
  detail: z.string()
});
export const githubSchema = z.object({
  at: z.string().nullable(),
  error: z.string().nullable(),
  issues: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      group: z.enum(["ready", "spec", "waiting"]),
      reason: z.string()
    })
  ),
  pulls: z.record(z.string(), z.enum(["open", "closed", "merged"])),
  failures: z.array(z.string())
});
export const healthSchema = z.object({
  at: z.string().nullable(),
  docker: z.boolean().nullable(),
  rollout: z.string().nullable(),
  workers: z.array(
    z.object({
      provider: providerSchema,
      isolation: z.boolean(),
      authenticated: z.boolean(),
      version: z.string().optional(),
      error: z.string().optional()
    })
  ),
  pilots: z.array(
    z.object({
      provider: providerSchema,
      tier: z.string(),
      current: z.boolean(),
      at: z.string().nullable()
    })
  )
});
const selectionSchema = z.object({ provider: providerSchema, model: z.string() });
export const stateSchema = z.object({
  worktrees: z
    .array(
      z.object({
        id: z.string(),
        path: z.string(),
        branch: z.string(),
        available: z.boolean(),
        configured: z.boolean()
      })
    )
    .default([]),
  selectedWorktree: z.string().nullable().default(null),
  activeRuns: z.array(summarySchema).default([]),
  repository: z.string(),
  enabled: z.boolean(),
  watchEnabled: z.boolean(),
  watcher: z.enum(["stopped", "running", "external"]),
  stages: z.object({
    intake: selectionSchema,
    spec: selectionSchema,
    implement: selectionSchema,
    review: selectionSchema,
    learn: selectionSchema
  }),
  models: z.object({ codex: z.string(), claude: z.string() }),
  at: z.string(),
  active: z.string().uuid().nullable(),
  warnings: z.array(z.string()),
  runs: z.array(summarySchema),
  activeRun: summarySchema.nullable().default(null),
  attention: z.array(summarySchema).default([]),
  total: z.number(),
  page: z.number(),
  actions: z.array(actionSchema),
  github: githubSchema,
  health: healthSchema
});
export const logSchema = z.object({ text: z.string(), truncated: z.boolean() });
export type FactoryEvent = z.infer<typeof eventSchema>;
export type FactoryAction = z.infer<typeof actionSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type DashboardState = z.infer<typeof stateSchema>;
export type RunSummary = z.infer<typeof summarySchema>;
export type RunDetail = z.infer<typeof detailSchema>;
