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

/**
 * Extra tools an agent can switch on. Each one lets it run one repository command, with any
 * arguments. They write files, so only an edit-code agent gets them (`validateAgent`).
 */
export const AGENT_TOOLS = ["doc-export"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

/** The command each extra tool allows. */
export const AGENT_TOOL_COMMANDS: Readonly<Record<AgentTool, string>> = {
  "doc-export": "pnpm doc:export"
};

export const isAgentTool = (name: string): name is AgentTool =>
  AGENT_TOOLS.some((tool) => tool === name);

export const agentCapabilitiesSchema = z
  .object({
    preset: capabilityPresetSchema,
    /** MCP server names from `.ai/mcp.json`. */
    mcp: z.array(z.string().min(1)).default([]),
    /** Skill names from `.ai/skills`. */
    skills: z.array(z.string().min(1)).default([]),
    /** Extra tools from `AGENT_TOOLS`. `validateAgent` refuses any other name. */
    tools: z.array(z.string().min(1)).default([])
  })
  .strict();
export type AgentCapabilities = z.infer<typeof agentCapabilitiesSchema>;

/**
 * What an agent avatar shows: a lucide icon name and a theme tone. The page draws the icon on
 * the tone's tint. There are no images, so an avatar works offline.
 */
export const AGENT_AVATAR_GLYPHS = [
  "bot",
  "notebook-pen",
  "hammer",
  "shield-check",
  "file-text",
  "lightbulb",
  "palette",
  "wand",
  "terminal",
  "blocks",
  "lock",
  "book-open",
  "scissors",
  "search",
  "compass",
  "gauge"
] as const;
export type AgentAvatarGlyph = (typeof AGENT_AVATAR_GLYPHS)[number];

/** The avatar tones: the identity role tints and the chart tints, which tell categories apart. */
export const AGENT_AVATAR_TONES = [
  "brand",
  "discovery",
  "information",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6"
] as const;
export type AgentAvatarTone = (typeof AGENT_AVATAR_TONES)[number];

export const agentAvatarSchema = z
  .object({ glyph: z.enum(AGENT_AVATAR_GLYPHS), tone: z.enum(AGENT_AVATAR_TONES) })
  .strict();
export type AgentAvatarSpec = z.infer<typeof agentAvatarSchema>;

/** FNV-1a over the UTF-16 code units: the same id gives the same number on every machine. */
const idHash = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
};

/**
 * The avatar of an agent: its own, or a default that depends only on its id. The glyph takes
 * the low part of the id's hash and the tone the rest, so two ids rarely share both.
 */
export const avatarOf = (agent: {
  readonly id: string;
  readonly avatar?: AgentAvatarSpec | undefined;
}): AgentAvatarSpec => {
  if (agent.avatar !== undefined) return agent.avatar;
  const hash = idHash(agent.id);
  const glyphs = AGENT_AVATAR_GLYPHS.length;
  return {
    glyph: AGENT_AVATAR_GLYPHS[hash % glyphs] ?? "bot",
    tone: AGENT_AVATAR_TONES[Math.floor(hash / glyphs) % AGENT_AVATAR_TONES.length] ?? "brand"
  };
};

export const agentFrontmatterSchema = z
  .object({
    id: definitionIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    provider: providerSchema,
    model: z.string().min(1).optional(),
    output: agentOutputKindSchema,
    capabilities: agentCapabilitiesSchema,
    timeoutMinutes: z.number().int().positive().optional(),
    /** Cosmetic: no part of the definition's hash. Without it the page shows `avatarOf`. */
    avatar: agentAvatarSchema.optional()
  })
  .strict();
export type AgentFrontmatter = z.infer<typeof agentFrontmatterSchema>;

export const agentDefinitionSchema = agentFrontmatterSchema.extend({
  /** The Markdown body: line endings are LF and the ends are trimmed. */
  prompt: z.string().min(1)
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;
