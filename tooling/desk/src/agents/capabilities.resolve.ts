import {
  AGENT_TOOL_COMMANDS,
  isAgentTool,
  type AgentDefinition,
  type AgentTool,
  type CapabilityProfile,
  type CapabilitySandbox,
  type InstalledCapabilities,
  type Isolation,
  type Provider,
  type RemovedCapability
} from "../contracts";
import type { AgentPermissions } from "./agent.runner";
import {
  CONTEXT7_READ,
  DESK_COMMAND_DENIES,
  DESK_GIT_DENIES,
  FORBIDDEN_SERENA_TOOLS,
  GIT_READ,
  KAINE_SKILLS,
  PROTECTED_EDIT_RULES,
  PermissionsPolicyError,
  READ_TOOLS,
  SERENA_EDIT,
  SERENA_READ,
  WORKSPACE_NAME,
  WORKSPACE_SCRIPTS,
  bash
} from "./permissions";

/**
 * What one agent run gets, from what the agent asks for. Pure: the caller reads the policy
 * and what the checkout installed. The preset decides the tool set:
 *
 * - `read-only`: read tools, read-only git, and the read tools of its MCP servers;
 * - `run-checks`: read-only plus the exact `test`, `typecheck` and `lint` commands of the
 *   run's workspaces and one vitest file. It cannot edit;
 * - `edit-code`: run-checks plus Edit, Write, `pnpm generate` and the Serena edits. It
 *   always runs in the configured isolation: in Docker when the isolation is Docker.
 *
 * Extra tools (`AGENT_TOOLS`) add one allowed command each, with any arguments. Only an
 * edit-code agent gets them; for Codex the sandbox decides, as for every other command.
 *
 * The policy floor always applies: the `.ai/permissions.json` denies, the forbidden git
 * and desk commands, WebFetch and WebSearch, the Serena tools that write memory or run
 * commands, the protected paths, and every skill outside the agent's list. An agent can
 * only narrow it. What it asks for and does not get is in `removed`, with the reason.
 */

/** Bash deny rules from `.ai/permissions.json` (`readPolicyDenies`). */
export interface CapabilityPolicy {
  readonly denies: readonly string[];
}

export interface ResolveCapabilitiesInput {
  readonly agent: Pick<AgentDefinition, "capabilities">;
  readonly provider: Provider;
  /** `null`: the CLI's default model. */
  readonly model: string | null;
  readonly policy: CapabilityPolicy;
  /** What the checkout installed. Anything else the agent asks for is removed. */
  readonly installed: InstalledCapabilities;
  /** The isolation of the issue. Only an edit-code agent runs in Docker. */
  readonly isolation: Isolation;
  /** Exact workspace package names for the check commands. Without them there are none. */
  readonly workspaces?: readonly string[] | undefined;
}

/** Skills whose procedure needs a command the floor denies. No desk agent gets them. */
const FLOOR_SKILLS: ReadonlyMap<string, string> = new Map([
  ["kaine-open-pr", "it pushes and opens pull requests, and the engine ships"],
  ["kaine-rebase", "it rewrites and force-pushes the branch"],
  ["kaine-release-apps", "it moves release branches"],
  ["kaine-sync-docs", "it runs ai:install, which the engine runs itself"],
  ["kaine-triage-deps", "it changes pull requests with gh"]
]);

const NOT_INSTALLED = "not installed";
const NO_MCP_IN_CONTAINER = "no MCP inside the container";
const NO_MCP_FOR_CODEX = "Codex runs hold to the sandbox; the desk gives them no MCP server";
const CODEX_NOTE = "Codex: sandbox only, no MCP";

const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** The exact check commands of each workspace, in the order the allowlist has always had. */
const checkCommands = (workspaces: readonly string[]): string[] =>
  workspaces.flatMap((workspace) => [
    ...WORKSPACE_SCRIPTS.flatMap((script) => [
      bash(`pnpm --filter ${workspace} ${script}`),
      // A fresh worktree has no built packages. Turbo's `test` builds the dependencies first.
      bash(`pnpm turbo run ${script} --filter=${workspace}`)
    ]),
    // One test file for the red-first loop. A workspace `test` script may chain other commands.
    bash(`pnpm --filter ${workspace} exec vitest run`)
  ]);

/** The read tools of an MCP server. Serena and Context7 have exact lists; another server is allowed whole. */
const mcpReadRules = (server: string): readonly string[] =>
  server === "serena" ? SERENA_READ : server === "context7" ? CONTEXT7_READ : [`mcp__${server}`];

const sandboxOf = (input: ResolveCapabilitiesInput): CapabilitySandbox => {
  const { preset } = input.agent.capabilities;
  if (preset === "edit-code" && input.isolation === "docker") return "docker";
  if (input.provider === "codex") {
    return preset === "edit-code" ? "codex-workspace-write" : "codex-read-only";
  }
  return "host";
};

const networkOf = (sandbox: CapabilitySandbox, mcp: readonly string[]): string => {
  switch (sandbox) {
    case "docker":
      return "container: the provider API through the desk proxy only";
    case "codex-read-only":
    case "codex-workspace-write":
      return "none: the Codex sandbox has no network access";
    case "host":
      return mcp.length === 0
        ? "host: WebFetch and WebSearch denied"
        : "host: WebFetch and WebSearch denied; MCP servers run on the host";
  }
};

export const resolveCapabilities = (input: ResolveCapabilitiesInput): CapabilityProfile => {
  const { preset } = input.agent.capabilities;
  const workspaces = input.workspaces ?? [];
  for (const name of workspaces) {
    if (!WORKSPACE_NAME.test(name)) {
      throw new PermissionsPolicyError("invalid-input", `Invalid workspace name '${name}'.`);
    }
  }
  const removed: RemovedCapability[] = [];
  const notes: string[] = [];

  const skills = unique(input.agent.capabilities.skills).filter((skill) => {
    const floor = FLOOR_SKILLS.get(skill);
    if (floor !== undefined) {
      removed.push({ kind: "skill", name: skill, reason: `policy floor: ${floor}` });
      return false;
    }
    if (!input.installed.skills.includes(skill)) {
      removed.push({ kind: "skill", name: skill, reason: NOT_INSTALLED });
      return false;
    }
    return true;
  });

  // The servers the tool rules name. The isolation and the provider decide which ones load.
  const granted = unique(input.agent.capabilities.mcp).filter((server) => {
    if (input.installed.mcp.includes(server)) return true;
    removed.push({ kind: "mcp", name: server, reason: NOT_INSTALLED });
    return false;
  });
  const sandbox = sandboxOf(input);
  const unloaded =
    sandbox === "docker"
      ? NO_MCP_IN_CONTAINER
      : input.provider === "codex"
        ? NO_MCP_FOR_CODEX
        : null;
  const mcp = unloaded === null ? granted : [];
  if (unloaded !== null) {
    removed.push(
      ...granted.map((server) => ({ kind: "mcp" as const, name: server, reason: unloaded }))
    );
  }

  // Extra tools write files: only an edit-code agent gets them. `validateAgent` refuses the rest.
  const extraTools = unique(input.agent.capabilities.tools).flatMap((tool): AgentTool[] => {
    if (!isAgentTool(tool)) {
      removed.push({ kind: "tool", name: tool, reason: "unknown tool" });
      return [];
    }
    if (preset !== "edit-code") {
      removed.push({ kind: "tool", name: tool, reason: "needs the edit-code preset" });
      return [];
    }
    return [tool];
  });

  if (input.provider === "codex") notes.push(CODEX_NOTE);
  if (input.provider === "codex" && extraTools.length > 0) {
    notes.push("Codex: extra tools run as ordinary commands in the workspace-write sandbox");
  }
  if (preset === "run-checks" && input.isolation === "docker") {
    notes.push(
      "run-checks runs its check commands on the host: only edit-code agents run in Docker"
    );
  }
  if (preset !== "read-only" && workspaces.length === 0) {
    notes.push("Check commands are granted per run, for the workspaces the plan names");
  }

  const profile = {
    provider: input.provider,
    model: input.model,
    preset,
    sandbox,
    extraTools,
    mcp,
    skills,
    network: networkOf(sandbox, mcp),
    removed,
    notes
  };
  // Codex takes no rule lists: the sandbox is the whole policy.
  if (input.provider === "codex") return { ...profile, tools: { allow: [], deny: [] } };

  const allow: string[] = [
    ...READ_TOOLS,
    ...skills.map((skill) => `Skill(skill:${skill})`),
    ...GIT_READ,
    ...granted.flatMap(mcpReadRules)
  ];
  if (preset === "edit-code") {
    allow.push("Edit", "Write", bash("pnpm generate"));
    if (granted.includes("serena")) allow.push(...SERENA_EDIT);
  }
  if (preset !== "read-only") allow.push(...checkCommands(workspaces));
  if (preset === "edit-code" && skills.includes("kaine-create-feature")) {
    allow.push(bash("pnpm create:feature"));
  }
  for (const tool of extraTools) allow.push(bash(AGENT_TOOL_COMMANDS[tool]));

  const inScope = new Set(skills);
  const outOfScope = unique([...KAINE_SKILLS, ...input.installed.skills])
    .filter((skill) => !inScope.has(skill))
    .sort();
  const deny = unique([
    ...input.policy.denies,
    ...DESK_GIT_DENIES,
    ...DESK_COMMAND_DENIES,
    "WebFetch",
    "WebSearch",
    ...FORBIDDEN_SERENA_TOOLS,
    ...PROTECTED_EDIT_RULES,
    ...outOfScope.map((skill) => `Skill(skill:${skill})`)
  ]);
  return { ...profile, tools: { allow, deny } };
};

/**
 * The runner's form of a profile. Claude gets the rule lists. Codex gets a sandbox: only an
 * edit-code agent may write, and a Docker run lowers it only inside the container.
 */
export const toAgentPermissions = (profile: CapabilityProfile): AgentPermissions =>
  profile.provider === "codex"
    ? {
        allow: [],
        disallow: [],
        sandbox: profile.preset === "edit-code" ? "workspace-write" : "read-only"
      }
    : { allow: profile.tools.allow, disallow: profile.tools.deny };
