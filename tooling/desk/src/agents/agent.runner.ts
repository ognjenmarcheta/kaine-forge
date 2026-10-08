import type { z } from "zod";

import type { Provider } from "../contracts";
import type { DeskRole } from "../engine/worktree.bootstrap";

/**
 * The AgentRunner port: run one agent turn in a worktree and return a typed
 * result or a typed failure. The Claude and Codex runners implement it, and
 * `createReplayRunner` implements it for tests of the engine.
 */

export type SandboxMode = "read-only" | "workspace-write";

/** `invoke`: the agent calls each skill itself. `inline`: the prompt carries the skill text. */
export type SkillMode = "invoke" | "inline";

export interface AgentPermissions {
  /** Claude `--allowedTools` rules. Ignored by Codex. */
  readonly allow: readonly string[];
  /** Claude `--disallowedTools` rules. Defence in depth only: prefix denies can be bypassed. */
  readonly disallow: readonly string[];
  /** Codex sandbox. A planner or reviewer is always `read-only`. */
  readonly sandbox?: SandboxMode | undefined;
}

export interface AgentRunRequest<T> {
  readonly role: DeskRole;
  readonly provider: Provider;
  readonly model?: string | undefined;
  readonly prompt: string;
  /** The desk override block. Claude: `--append-system-prompt`. Codex: part of the prompt. */
  readonly systemAppend?: string | undefined;
  /** JSON Schema the provider uses to constrain the final answer. */
  readonly outputSchema: z.core.JSONSchema.BaseSchema;
  /** Every result is parsed again here, whatever the provider promised. */
  readonly parse: z.ZodType<T>;
  readonly cwd: string;
  /** Claude session id or Codex thread id of an earlier run. */
  readonly resumeSessionId?: string | undefined;
  readonly permissions: AgentPermissions;
  /** Claude `--settings` file (hooks). */
  readonly settingsPath?: string | undefined;
  /** Claude `--mcp-config` file. Without it Claude loads no MCP server. */
  readonly mcpConfigPath?: string | undefined;
  /** The receipt hook appends executed tool calls here. */
  readonly receiptsPath?: string | undefined;
  readonly timeoutMs: number;
  /** Skills the role must use. */
  readonly skills: readonly string[];
  readonly skillMode: SkillMode;
  /**
   * Config opt-in for a Codex builder. Without it the Codex runner refuses a
   * builder, because a Codex sandbox is coarser than a Claude allowlist.
   */
  readonly allowCodexBuilder?: boolean | undefined;
  /**
   * The container is the sandbox. Only the Docker isolation sets it, and a Codex
   * runner honours it only when the runner itself was built for a container
   * (`CodexRunnerDeps.insideContainer`). A host runner refuses a request that
   * carries it, so the flag alone never lowers a sandbox on the host.
   */
  readonly containerSandbox?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Called once with the child pid after the process starts. The engine records it for recovery. */
  readonly onSpawn?: ((pid: number) => void) | undefined;
  /** Called for each event as it arrives, for live logs. */
  readonly onEvent?: ((event: AgentEvent) => void) | undefined;
}

/** One normalised step of an agent run, the same for both providers. */
export type AgentEvent =
  | { readonly type: "session"; readonly sessionId: string }
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_call";
      readonly id: string;
      /** `Bash`, `Read`, `Skill`, `Edit`, `mcp__…`, or `FileChange` for a Codex edit. */
      readonly tool: string;
      readonly command?: string | undefined;
      readonly paths: readonly string[];
      readonly skill?: string | undefined;
    }
  | {
      readonly type: "tool_result";
      readonly id: string;
      readonly isError: boolean;
      readonly exitCode?: number | null | undefined;
      /** The start of the output. Command output is bounded before it is stored. */
      readonly output: string;
    }
  | { readonly type: "denial"; readonly denial: AgentDenial }
  | { readonly type: "error"; readonly message: string };

export interface AgentDenial {
  readonly tool: string;
  readonly toolUseId?: string | undefined;
  readonly command?: string | undefined;
  readonly paths: readonly string[];
}

export interface AgentUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

export interface AgentRunResult<T> {
  readonly structured: T;
  readonly sessionId: string;
  readonly usage: AgentUsage;
  readonly costUsd?: number | undefined;
  readonly denials: readonly AgentDenial[];
  readonly trace: readonly AgentEvent[];
  /** The agent's final text answer. */
  readonly resultText: string;
}

export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

export type AgentFailure =
  | { readonly kind: "timeout"; readonly timeoutMs: number }
  | {
      readonly kind: "process-error";
      readonly message: string;
      readonly exitCode: number | null;
      readonly stderrTail: string;
    }
  | { readonly kind: "no-result"; readonly message: string }
  | { readonly kind: "schema-mismatch"; readonly issues: readonly SchemaIssue[] }
  | { readonly kind: "aborted" };

/** What a failed run still tells the engine: the trace to show and the session to keep. */
export interface AgentRunPartial {
  readonly trace: readonly AgentEvent[];
  readonly sessionId: string | null;
  readonly denials: readonly AgentDenial[];
}

export type AgentRunOutcome<T> =
  | { readonly ok: true; readonly result: AgentRunResult<T> }
  | { readonly ok: false; readonly failure: AgentFailure; readonly partial: AgentRunPartial };

export interface AgentRunner {
  readonly run: <T>(request: AgentRunRequest<T>) => Promise<AgentRunOutcome<T>>;
}

export const NO_USAGE: AgentUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** Largest prompt passed as one argv entry. Linux caps a single argument at 128 KiB. */
export const MAX_PROMPT_BYTES = 100_000;

export const schemaIssues = (error: z.ZodError): SchemaIssue[] =>
  error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

export const describeFailure = (failure: AgentFailure): string => {
  switch (failure.kind) {
    case "timeout":
      return `The agent timed out after ${failure.timeoutMs} ms.`;
    case "process-error":
      return failure.message;
    case "no-result":
      return failure.message;
    case "schema-mismatch":
      return `The agent result does not match the schema: ${failure.issues
        .map((issue) => `${issue.path || "(root)"}: ${issue.message}`)
        .join("; ")}`;
    case "aborted":
      return "The agent run was cancelled.";
  }
};
