import { z } from "zod";

import { capabilityPresetSchema } from "./agent-definition.contract";
import { providerSchema } from "./desk-config.contract";

/**
 * What one agent run actually gets: the agent's capabilities after the policy floor, the
 * installed MCP servers and skills, the provider and the isolation narrowed them. The engine
 * records it with each run, and the agents API shows it for each agent. Browser-safe.
 */

/**
 * Where the agent runs and what holds it there. `docker`: a container, for an edit-code agent
 * when the isolation is Docker. `codex-*`: the Codex sandbox on the host. `host`: the Claude
 * allowlist on the host.
 */
export const CAPABILITY_SANDBOXES = [
  "host",
  "docker",
  "codex-read-only",
  "codex-workspace-write"
] as const;
export const capabilitySandboxSchema = z.enum(CAPABILITY_SANDBOXES);
export type CapabilitySandbox = z.infer<typeof capabilitySandboxSchema>;

export const removedCapabilitySchema = z
  .object({
    kind: z.enum(["tool", "mcp", "skill"]),
    name: z.string().min(1),
    /** Engine text: why the run does not get it. */
    reason: z.string().min(1)
  })
  .strict();
export type RemovedCapability = z.infer<typeof removedCapabilitySchema>;

export const capabilityProfileSchema = z
  .object({
    provider: providerSchema,
    /** `null`: the CLI's default model. */
    model: z.string().min(1).nullable(),
    preset: capabilityPresetSchema,
    sandbox: capabilitySandboxSchema,
    /** Claude allow and deny rules. Both are empty for Codex: its sandbox decides. */
    tools: z.object({ allow: z.array(z.string()), deny: z.array(z.string()) }).strict(),
    /** MCP servers the run loads. */
    mcp: z.array(z.string()),
    /** Skills the run must use. */
    skills: z.array(z.string()),
    /** Engine text: what the run can reach on the network. */
    network: z.string(),
    /** What the agent asked for and does not get. */
    removed: z.array(removedCapabilitySchema),
    /** Engine text: limits the profile cannot show as a rule. */
    notes: z.array(z.string())
  })
  .strict();
export type CapabilityProfile = z.infer<typeof capabilityProfileSchema>;
