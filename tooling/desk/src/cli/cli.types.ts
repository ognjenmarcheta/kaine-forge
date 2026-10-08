import type { AgentProcess } from "../agents/agent.process";
import type { AgentRunner } from "../agents/agent.runner";
import type { Provider } from "../contracts";
import type { PipelineDeps } from "../engine/pipeline.types";
import type { GitPort } from "../git";
import type { Clock, Exec, GitHubPort } from "../ports";
import type { LaunchOptions } from "../server/server.launch";

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  /** Empty when `CliDeps.live` printed the output as it came. */
  readonly stderr: string;
}

/** Where output goes while a command runs. The default buffers it into the `CliResult`. */
export interface LiveOutput {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** What Docker isolation needs from the process. Tests pass fakes. */
export interface DockerCliDeps {
  /** Runs `docker` and `git`. Its output cap must exceed the largest patch. */
  readonly exec: Exec;
  /** Streams `docker run` for an agent. */
  readonly process: AgentProcess;
  /** Runs a command on the terminal with stdin and stdout attached. Returns the exit code. */
  readonly interactive: (argv: readonly string[]) => Promise<number>;
  /** Seams for tests. */
  readonly imageTag?: string | undefined;
  readonly newId?: (() => string) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly binaries?: Partial<Record<Provider, string>> | undefined;
}

/** Everything the CLI touches outside its arguments. Tests pass fakes. */
export interface CliDeps {
  readonly exec: Exec;
  readonly clock: Clock;
  readonly cwd: string;
  readonly nodeVersion: string;
  readonly createGitHub: (cwd: string) => GitHubPort;
  readonly git: GitPort;
  readonly runnerFor: (provider: Provider) => AgentRunner;
  /** Docker support. Absent when Docker is not wired in (most tests). */
  readonly docker?: DockerCliDeps | undefined;
  /**
   * Ask the person a yes or no question on a terminal. Absent when there is no
   * terminal (a pipe, CI, a test): then `ship` without `--confirm` refuses.
   */
  readonly ask?: ((question: string) => Promise<boolean>) | undefined;
  /** Print as the command runs. A command that drives an agent can take an hour. */
  readonly live?: LiveOutput | undefined;
  /** Ends `logs --follow` and `serve`. */
  readonly signal?: AbortSignal | undefined;
  /** Runs the local server for `serve`. Default: `serveDesk`. A test passes a fake. */
  readonly serve?:
    | ((options: LaunchOptions & { readonly signal?: AbortSignal | undefined }) => Promise<void>)
    | undefined;
  /** Poll interval of `logs --follow`. Default 500 ms. */
  readonly followIntervalMs?: number | undefined;
  /** Size limit of one `agent.log.jsonl`. */
  readonly logMaxBytes?: number | undefined;
  /** Seams for tests (lease checks, scheduler, timeouts). */
  readonly pipeline?:
    | Partial<
        Pick<
          PipelineDeps,
          "lease" | "prompts" | "scheduler" | "agentTimeoutsMs" | "setupTimeoutsMs"
        >
      >
    | undefined;
}

/** Output of one command. All text goes through here, so `--json` stays clean. */
export interface CliIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** A command returns its exit code: 0 done or at a gate, 1 needs you or failed. Usage errors throw. */
export type CliCommand = (args: string[], deps: CliDeps, io: CliIo) => Promise<number>;

export class UsageError extends Error {
  override readonly name = "UsageError";
}
