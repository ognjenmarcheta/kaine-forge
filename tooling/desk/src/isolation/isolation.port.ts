import type { AgentRunner } from "../agents/agent.runner";
import type { CheckReport, RunChecksRequest } from "../check";
import type { AgentStageRole, Isolation, Provider } from "../contracts";

/**
 * The one seam between the pipeline and the place where repository code runs.
 * The engine asks the port for the runner of an agent stage and for the check
 * run. `host` runs them in the worktree. `docker` runs the builder and the
 * checks in containers and keeps the host worktree as the canonical copy.
 * Planner and reviewer run no repository code, so both modes run them on the host.
 */

export interface IsolatedStage {
  readonly role: AgentStageRole;
  readonly provider: Provider;
  readonly issue: number;
  readonly worktree: string;
  readonly baseSha: string;
  readonly artifactsDir: string;
}

export interface IsolatedCheckRequest extends RunChecksRequest {
  readonly issue: number;
}

export interface IsolationPort {
  readonly mode: Isolation;
  /** A reason the mode cannot run now (no daemon, no image), or `null`. `start` asks before it does any work. */
  readonly preflight: () => Promise<string | null>;
  readonly runnerFor: (stage: IsolatedStage) => AgentRunner;
  readonly runChecks: (request: IsolatedCheckRequest) => Promise<CheckReport>;
  /**
   * Remove containers that a crashed or cancelled run left for the issue.
   * Returns a note for the history, or `null` when there was nothing to do.
   */
  readonly removeContainers: (issue: number) => Promise<string | null>;
  /** Remove every container and volume of the issue. Verified. Throws when it cannot verify. */
  readonly removeIssue: (issue: number) => Promise<string | null>;
}
