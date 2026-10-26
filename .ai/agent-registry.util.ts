import { existsSync, readFileSync } from "node:fs";

import {
  type Agent,
  type AgentDefinition,
  CURSOR_RULES_SRC,
  type McpSource,
  renderClaudeAgentDefinition,
  renderClaudeSettings,
  renderClaudeSkill,
  renderCodexConfig,
  renderCodexSkill,
  renderCursorHooks,
  renderCursorRulesFile,
  renderCursorSkill,
  renderGrokAgentDefinition,
  renderGrokConfig,
  renderGrokPreToolUseHook,
  renderGrokSessionStartHook,
  renderGrokSkill,
  renderMcpJson,
  renderOpencodeAgentDefinition,
  renderOpencodeConfig,
  renderOpencodeGuardrailPlugin,
  renderOpencodeSkill,
  type Skill
} from "./ai.util";

export interface GeneratedFile {
  /** Repo-relative path. */
  path: string;
  /** `undefined` when the canonical source is absent, so nothing is written. */
  render: () => string | undefined;
  /** computeHookDrift checks the file once the agent is installed. */
  hook?: true;
}

/** Everything ai:install, ai:doctor and readiness need to know about one agent. */
export interface AgentFacts {
  label: string;
  skillDir: string;
  renderSkill: (skill: Skill) => string;
  mcpConfig: { path: string; format: "json" | "toml"; render: (source: McpSource) => string };
  agentDefinitions?: { dir: string; render: (definition: AgentDefinition) => string };
  generatedFiles: readonly GeneratedFile[];
  /** Any of these repo-relative paths existing means the agent is installed here. */
  installMarkers: readonly string[];
  /** Whether the agent runs .ai/hooks/pre-tool-use.mjs; OpenCode uses its plugin instead. */
  preToolUseHook: boolean;
}

export const AGENT_REGISTRY: Readonly<Record<Agent, AgentFacts>> = {
  claude: {
    label: "Claude Code",
    skillDir: ".claude/skills",
    renderSkill: renderClaudeSkill,
    mcpConfig: { path: ".mcp.json", format: "json", render: renderMcpJson },
    agentDefinitions: { dir: ".claude/agents", render: renderClaudeAgentDefinition },
    generatedFiles: [{ path: ".claude/settings.json", render: renderClaudeSettings }],
    installMarkers: [".claude"],
    preToolUseHook: true
  },
  codex: {
    label: "Codex",
    skillDir: ".agents/skills",
    renderSkill: renderCodexSkill,
    mcpConfig: { path: ".codex/config.toml", format: "toml", render: renderCodexConfig },
    generatedFiles: [],
    installMarkers: [".codex"],
    preToolUseHook: true
  },
  cursor: {
    label: "Cursor",
    skillDir: ".cursor/skills",
    renderSkill: renderCursorSkill,
    mcpConfig: { path: ".cursor/mcp.json", format: "json", render: renderMcpJson },
    generatedFiles: [
      { path: ".cursor/hooks.json", render: renderCursorHooks, hook: true },
      {
        path: ".cursor/rules/kaine-rules.mdc",
        render: () =>
          existsSync(CURSOR_RULES_SRC)
            ? renderCursorRulesFile(readFileSync(CURSOR_RULES_SRC, "utf8"))
            : undefined
      }
    ],
    installMarkers: [".cursor"],
    preToolUseHook: true
  },
  opencode: {
    label: "OpenCode",
    skillDir: ".opencode/skills",
    renderSkill: renderOpencodeSkill,
    mcpConfig: { path: "opencode.json", format: "json", render: renderOpencodeConfig },
    agentDefinitions: { dir: ".opencode/agents", render: renderOpencodeAgentDefinition },
    generatedFiles: [
      {
        path: ".opencode/plugins/kaine-guardrail.ts",
        render: renderOpencodeGuardrailPlugin,
        hook: true
      }
    ],
    installMarkers: [".opencode", "opencode.json"],
    preToolUseHook: false
  },
  grok: {
    label: "Grok Build",
    skillDir: ".grok/skills",
    renderSkill: renderGrokSkill,
    mcpConfig: { path: ".grok/config.toml", format: "toml", render: renderGrokConfig },
    agentDefinitions: { dir: ".grok/agents", render: renderGrokAgentDefinition },
    generatedFiles: [
      {
        path: ".grok/hooks/kaine-session-start.json",
        render: renderGrokSessionStartHook,
        hook: true
      },
      { path: ".grok/hooks/kaine-pre-tool-use.json", render: renderGrokPreToolUseHook, hook: true }
    ],
    installMarkers: [".grok/skills", ".grok/config.toml", ".grok/agents"],
    preToolUseHook: true
  }
};
