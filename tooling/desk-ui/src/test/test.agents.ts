import type { AgentDefinition, AgentList, AgentView, DefinitionSource } from "@repo/desk/contracts";

/** What the checkout of the page tests has installed. */
export const INSTALLED: AgentList["installed"] = { mcp: ["serena"], skills: [] };

/** An agent definition for page tests: a read-only report agent unless the test says more. */
export const agentDefinition = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id: "notes",
  name: "Release notes",
  description: "Writes the release notes of a change.",
  provider: "claude",
  output: "report",
  capabilities: { preset: "read-only", mcp: ["serena"], skills: [], tools: [] },
  prompt: "# Release notes\n\nWrite the notes.",
  ...overrides
});

/** An agent as the agents API lists it, resolved for Claude on the host. */
export const agentView = (
  definition: AgentDefinition,
  source: DefinitionSource,
  shadows: DefinitionSource | null = null
): AgentView => ({
  definition,
  source,
  shadows,
  readOnly: source === "builtin",
  hash: "a".repeat(64),
  problems: [],
  resolved: {
    provider: definition.provider,
    model: definition.model ?? null,
    preset: definition.capabilities.preset,
    sandbox: "host",
    tools: { allow: ["Read"], deny: ["WebFetch"] },
    extraTools: definition.capabilities.preset === "edit-code" ? definition.capabilities.tools : [],
    mcp: definition.capabilities.mcp,
    skills: definition.capabilities.skills,
    network: "host: WebFetch and WebSearch denied",
    removed: [],
    notes: []
  }
});
