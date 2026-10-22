import type {
  AgentCapabilities,
  AgentDefinition,
  CapabilityProfile,
  Isolation,
  Provider
} from "../contracts";
import type { AgentPermissions } from "./agent.runner";
import { resolveCapabilities, toAgentPermissions } from "./capabilities.resolve";
import { readPolicyDenies } from "./permissions";
import { ROLE_SKILLS, type DeskRole } from "../engine/worktree.bootstrap";
import { readInstalledCapabilities } from "../registry/registry.snapshot";

/** The capability resolver over a checkout: its policy file and what it installed. */

export interface LoadCapabilitiesInput {
  readonly agent: Pick<AgentDefinition, "capabilities">;
  readonly provider: Provider;
  readonly model: string | null;
  /** The checkout the agent runs in. The policy and the installed servers and skills are read here. */
  readonly checkout: string;
  readonly isolation: Isolation;
  readonly workspaces?: readonly string[] | undefined;
}

export const loadCapabilities = async (input: LoadCapabilitiesInput): Promise<CapabilityProfile> =>
  resolveCapabilities({
    agent: input.agent,
    provider: input.provider,
    model: input.model,
    policy: { denies: await readPolicyDenies(input.checkout) },
    installed: await readInstalledCapabilities(input.checkout),
    isolation: input.isolation,
    workspaces: input.workspaces
  });

/** The capabilities of a built-in role, as its agent file states them. */
export const builtinCapabilities = (
  role: DeskRole,
  skills: readonly string[] = ROLE_SKILLS[role]
): AgentCapabilities => ({
  preset: role === "builder" ? "edit-code" : "read-only",
  mcp: ["serena", "context7"],
  skills: [...skills]
});

export interface PermissionsOptions {
  /** Absolute path of the issue worktree. The policy is read from here. */
  readonly worktree: string;
  /**
   * Workspace package names whose `test`, `typecheck` and `lint` scripts a
   * builder may run, for example `@repo/api`. Exact names only. Without them a
   * builder can run `pnpm generate` and nothing else of pnpm.
   */
  readonly workspaces?: readonly string[];
  /** Skills for this run. Default: the role's own list. */
  readonly skills?: readonly string[];
}

/** Allow and deny rules, or the Codex sandbox, of a built-in role on the host. */
export const permissionsFor = async (
  role: DeskRole,
  provider: Provider,
  options: PermissionsOptions
): Promise<AgentPermissions> =>
  toAgentPermissions(
    await loadCapabilities({
      agent: { capabilities: builtinCapabilities(role, options.skills) },
      provider,
      model: null,
      checkout: options.worktree,
      isolation: "host",
      workspaces: options.workspaces
    })
  );
