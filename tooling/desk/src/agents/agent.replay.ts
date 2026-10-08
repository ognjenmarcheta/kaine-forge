import type { Provider } from "../contracts";
import { jsonFromText, type JsonValue } from "./agent.json-value";
import {
  NO_USAGE,
  schemaIssues,
  type AgentDenial,
  type AgentEvent,
  type AgentFailure,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunner,
  type AgentUsage
} from "./agent.runner";
import { parseClaudeStream } from "./claude.stream";
import { parseCodexStream } from "./codex.stream";
import type { DeskRole } from "../engine/worktree.bootstrap";

/**
 * A fake agent for the tests of later phases. Each call to `run` takes the
 * next step that fits the request's role and provider, and answers like a
 * real runner: the canned output goes through the request's parser, so a step
 * with a bad shape fails with `schema-mismatch`. The runner records the
 * requests it received.
 */

export interface ReplayStep {
  /** Only serve a request for this role. */
  readonly role?: DeskRole;
  /** Only serve a request for this provider. */
  readonly provider?: Provider;
  /** The canned structured output. */
  readonly structured?: JsonValue;
  /** Return this failure instead of a result. */
  readonly failure?: AgentFailure;
  readonly sessionId?: string;
  readonly trace?: readonly AgentEvent[];
  readonly denials?: readonly AgentDenial[];
  readonly usage?: AgentUsage;
  readonly costUsd?: number;
  readonly resultText?: string;
}

/** A request as the replay runner stores it. The parser is dropped. */
export type RecordedRequest = Omit<AgentRunRequest<never>, "parse">;

export interface ReplayRunner extends AgentRunner {
  readonly requests: readonly RecordedRequest[];
  /** Steps not used yet. */
  readonly remaining: () => number;
}

const recordedRequest = <T>(request: AgentRunRequest<T>): RecordedRequest => ({
  role: request.role,
  provider: request.provider,
  model: request.model,
  prompt: request.prompt,
  systemAppend: request.systemAppend,
  outputSchema: request.outputSchema,
  cwd: request.cwd,
  resumeSessionId: request.resumeSessionId,
  permissions: request.permissions,
  settingsPath: request.settingsPath,
  mcpConfigPath: request.mcpConfigPath,
  receiptsPath: request.receiptsPath,
  timeoutMs: request.timeoutMs,
  skills: request.skills,
  skillMode: request.skillMode,
  allowCodexBuilder: request.allowCodexBuilder,
  signal: request.signal,
  onSpawn: request.onSpawn,
  onEvent: request.onEvent
});

export const createReplayRunner = (steps: readonly ReplayStep[]): ReplayRunner => {
  const pending = [...steps];
  const requests: RecordedRequest[] = [];
  let sessions = 0;

  return {
    requests,
    remaining: () => pending.length,
    run: <T>(request: AgentRunRequest<T>): Promise<AgentRunOutcome<T>> => {
      requests.push(recordedRequest(request));

      const index = pending.findIndex(
        (step) =>
          (step.role === undefined || step.role === request.role) &&
          (step.provider === undefined || step.provider === request.provider)
      );
      const step = index < 0 ? undefined : pending.splice(index, 1)[0];
      const sessionId =
        step?.sessionId ?? request.resumeSessionId ?? `replay-session-${++sessions}`;
      const trace = step?.trace ?? [];
      const denials = step?.denials ?? [];
      const partial = { trace, sessionId, denials };
      for (const event of trace) request.onEvent?.(event);

      if (step === undefined) {
        return Promise.resolve({
          ok: false,
          failure: {
            kind: "process-error",
            message: `The replay runner has no step for a ${request.provider} ${request.role} run.`,
            exitCode: null,
            stderrTail: ""
          },
          partial: { trace: [], sessionId: null, denials: [] }
        });
      }
      if (step.failure !== undefined) {
        return Promise.resolve({ ok: false, failure: step.failure, partial });
      }
      if (step.structured === undefined) {
        return Promise.resolve({
          ok: false,
          failure: { kind: "no-result", message: "The replay step has no structured output." },
          partial
        });
      }
      const parsed = request.parse.safeParse(step.structured);
      if (!parsed.success) {
        return Promise.resolve({
          ok: false,
          failure: { kind: "schema-mismatch", issues: schemaIssues(parsed.error) },
          partial
        });
      }
      return Promise.resolve({
        ok: true,
        result: {
          structured: parsed.data,
          sessionId,
          usage: step.usage ?? NO_USAGE,
          costUsd: step.costUsd,
          denials,
          trace,
          resultText: step.resultText ?? JSON.stringify(step.structured)
        }
      });
    }
  };
};

/** A step built from a recorded `claude -p --output-format stream-json` run. */
export const replayStepFromClaudeStream = (
  lines: Iterable<string>,
  overrides: Partial<ReplayStep> = {}
): ReplayStep => {
  const summary = parseClaudeStream(lines);
  return {
    ...(summary.final?.structured === undefined ? {} : { structured: summary.final.structured }),
    ...(summary.sessionId === null ? {} : { sessionId: summary.sessionId }),
    trace: summary.events,
    denials: summary.denials,
    ...(summary.final === null
      ? {}
      : { usage: summary.final.usage, resultText: summary.final.resultText }),
    ...(summary.final?.costUsd === undefined ? {} : { costUsd: summary.final.costUsd }),
    ...overrides
  };
};

/** A step built from a recorded `codex exec --json` run. */
export const replayStepFromCodexStream = (
  lines: Iterable<string>,
  overrides: Partial<ReplayStep> = {}
): ReplayStep => {
  const summary = parseCodexStream(lines);
  const structured = jsonFromText(summary.lastMessage ?? "");
  return {
    ...(structured === undefined ? {} : { structured }),
    ...(summary.threadId === null ? {} : { sessionId: summary.threadId }),
    trace: summary.events,
    usage: summary.usage,
    ...(summary.lastMessage === null ? {} : { resultText: summary.lastMessage }),
    ...overrides
  };
};
