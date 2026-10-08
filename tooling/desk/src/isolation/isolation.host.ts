import type { AgentRunner } from "../agents/agent.runner";
import { runChecks } from "../check";
import type { Provider } from "../contracts";
import type { IsolationPort } from "./isolation.port";

/** Host mode: today's behaviour. Agents and checks run in the worktree. */
export const createHostIsolation = (deps: {
  readonly runnerFor: (provider: Provider) => AgentRunner;
}): IsolationPort => ({
  mode: "host",
  preflight: () => Promise.resolve(null),
  runnerFor: (stage) => deps.runnerFor(stage.provider),
  runChecks: (request) => runChecks(request),
  removeContainers: () => Promise.resolve(null),
  removeIssue: () => Promise.resolve(null)
});
