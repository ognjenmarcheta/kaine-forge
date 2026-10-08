import type { AgentRunner } from "../agents/agent.runner";
import type { DeskConfig, Isolation, IssueState } from "../contracts";
import type { Provider } from "../contracts";
import { createHostIsolation } from "./isolation.host";
import type { IsolationPort } from "./isolation.port";

/** What the pipeline needs to choose a mode for an issue. */
export interface IsolationChoiceDeps {
  readonly config: Pick<DeskConfig, "isolation">;
  readonly runnerFor: (provider: Provider) => AgentRunner;
  /** Present when the CLI or server wired Docker. Absent in host-only setups and in most tests. */
  readonly docker?: IsolationPort | undefined;
}

/** The mode of one issue: its own choice (`desk start --isolation`), else the config default. */
export const isolationOf = (
  config: Pick<DeskConfig, "isolation">,
  state: Pick<IssueState, "isolation">
): Isolation => state.isolation ?? config.isolation;

export type IsolationSelection =
  | { readonly ok: true; readonly port: IsolationPort }
  | { readonly ok: false; readonly reason: string };

export const selectIsolation = (
  deps: IsolationChoiceDeps,
  state: Pick<IssueState, "isolation">
): IsolationSelection => {
  if (isolationOf(deps.config, state) === "host") {
    return { ok: true, port: createHostIsolation({ runnerFor: deps.runnerFor }) };
  }
  return deps.docker === undefined
    ? {
        ok: false,
        reason:
          "Docker isolation is requested, but this desk process has no Docker support wired in."
      }
    : { ok: true, port: deps.docker };
};

/** Remove containers a stopped run left behind. Host-mode issues cost no Docker call. */
export const containerCleanupFor =
  (deps: Pick<IsolationChoiceDeps, "config" | "docker">) =>
  async (state: Pick<IssueState, "isolation" | "issueNumber">): Promise<string | null> =>
    deps.docker !== undefined && isolationOf(deps.config, state) === "docker"
      ? deps.docker.removeContainers(state.issueNumber)
      : null;
