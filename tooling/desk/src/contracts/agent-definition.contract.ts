import { z } from "zod";

import { providerSchema } from "./desk-config.contract";

/**
 * An agent definition: the frontmatter of an agent file `<id>.md` plus its
 * Markdown body, the role prompt. Built-in agents live in
 * `tooling/desk/defaults/agents`; a repository and a developer can add or
 * override agents by id (see the registry loader).
 */

/** Id of an agent, a flow, or a flow step. It is also the file name. */
export const DEFINITION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const definitionIdSchema = z
  .string()
  .regex(DEFINITION_ID_PATTERN, "Use lowercase letters, digits and hyphens (at most 64)");

/** What a run of the agent produces. It selects the output schema. */
export const AGENT_OUTPUT_KINDS = ["plan", "change", "review", "report", "intake"] as const;
export const agentOutputKindSchema = z.enum(AGENT_OUTPUT_KINDS);
export type AgentOutputKind = z.infer<typeof agentOutputKindSchema>;

/** The tool set the agent gets. Only `edit-code` may change files. */
export const CAPABILITY_PRESETS = ["read-only", "edit-code", "run-checks"] as const;
export const capabilityPresetSchema = z.enum(CAPABILITY_PRESETS);
export type CapabilityPreset = z.infer<typeof capabilityPresetSchema>;

export const agentCapabilitiesSchema = z
  .object({
    preset: capabilityPresetSchema,
    /** MCP server names from `.ai/mcp.json`. */
    mcp: z.array(z.string().min(1)).default([]),
    /** Skill names from `.ai/skills`. */
    skills: z.array(z.string().min(1)).default([])
  })
  .strict();
export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;

export const agentFrontmatterSchema = z
  .object({
    id: definitionIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    provider: providerSchema,
    model: z.string().min(1).optional(),
    output: agentOutputKindSchema,
    capabilities: agentCapabilitiesSchema,
    timeoutMinutes: z.number().int().positive().optional()
  })
  .strict();
export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

export const agentDefinitionSchema = agentFrontmatterSchema.extend({
  /** The Markdown body: line endings are LF and the ends are trimmed. */
  prompt: z.string().min(1)
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
