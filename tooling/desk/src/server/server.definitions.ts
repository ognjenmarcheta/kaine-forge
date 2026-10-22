import path from "node:path";

import { loadCapabilities } from "../agents/capabilities.load";
import type { AgentList, DefinitionProblem, DeskConfig, FlowList } from "../contracts";
import { ROLE_FOR_OUTPUT, agentRuntime } from "../engine/pipeline.agent";
import { loadRegistry, type RegistryEntry, type RegistryProblem } from "../registry/registry.load";
import { readInstalledCapabilities } from "../registry/registry.snapshot";

/**
 * The agents and flows of a checkout as `GET /api/agents` and `GET /api/flows` show them:
 * the registry entries that won their id, the files that do not load, and for each agent the
 * capabilities a run gets with the desk's config now. Read-only.
 */

export interface DefinitionViews {
  readonly agents: AgentList;
  readonly flows: FlowList;
}

export interface DefinitionViewsInput {
  readonly repoRoot: string;
  readonly config: DeskConfig;
}

/** `agents` or `flows`: the directory a definition file is in. */
const kindOf = (problem: RegistryProblem): string => path.basename(path.dirname(problem.path));

/** The id a file name claims: its name without `.md` or `.yaml`. */
const idOf = (problem: RegistryProblem): string =>
  path.basename(problem.path).replace(/\.(md|yaml)$/, "");

const toProblem = (problem: RegistryProblem): DefinitionProblem => ({
  path: problem.path,
  source: problem.source,
  errors: [...problem.errors]
});

const entryFields = <T extends { readonly id: string }>(
  entry: RegistryEntry<T>,
  problems: readonly RegistryProblem[]
) => ({
  definition: entry.definition,
  source: entry.source,
  shadows: entry.shadows,
  readOnly: entry.readOnly,
  hash: entry.hash,
  problems: problems.filter((problem) => idOf(problem) === entry.definition.id).map(toProblem)
});

export const readDefinitionViews = async (
  input: DefinitionViewsInput
): Promise<DefinitionViews> => {
  const registry = await loadRegistry({ repoRoot: input.repoRoot });
  const agentProblems = registry.problems.filter((problem) => kindOf(problem) === "agents");
  const flowProblems = registry.problems.filter((problem) => kindOf(problem) === "flows");

  const agents = await Promise.all(
    registry.agents.map(async (entry) => {
      const agent = entry.definition;
      const { provider, model } = agentRuntime(input.config, ROLE_FOR_OUTPUT[agent.output], agent);
      return {
        ...entryFields(entry, agentProblems),
        resolved: await loadCapabilities({
          agent,
          provider,
          model: model ?? null,
          checkout: input.repoRoot,
          isolation: input.config.isolation
        })
      };
    })
  );
  const installed = await readInstalledCapabilities(input.repoRoot);
  return {
    agents: {
      agents,
      problems: agentProblems.map(toProblem),
      installed: { mcp: [...installed.mcp].sort(), skills: [...installed.skills].sort() }
    },
    flows: {
      flows: registry.flows.map((entry) => entryFields(entry, flowProblems)),
      problems: flowProblems.map(toProblem),
      defaultFlow: input.config.defaultFlow
    }
  };
};
