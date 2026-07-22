import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeAgentDefinitionDrift,
  discoverAgentDefinitions,
  lintAgentDefinitionsDir,
  lintGuideSkillList,
  missingEnvVarsForMcpServers,
  mergeMcpSources,
  parseAgentDefinitionFile,
  parseSkillFile,
  publicMcpServer,
  referencedEnvVars,
  renderAgentDoc,
  renderClaudeAgentDefinition,
  renderClaudeImport,
  renderClaudeSettings,
  renderCodexConfig,
  renderCursorRulesFile,
  renderCursorSkill,
  renderMcpJson,
  renderOpencodeConfig,
  renderOpencodeSkill,
  renderReviewDoc,
  renderSerenaMemory,
  renderSerenaProject,
  resolveInstallMcpSource,
  REVIEW_REQUIRED_HEADINGS
} from "./ai.util";

const agentDef = (
  name: string,
  description = "Does agent things.",
  body = "System prompt."
): string =>
  [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "model: inherit",
    "---",
    "",
    body,
    ""
  ].join("\n");

const baseFrontmatter = (extra: string): string =>
  ["---", "name: kaine-foo", "description: Does foo.", extra, "---", "", "Body."].join("\n");

describe("lintGuideSkillList", () => {
  const guide = [
    "# Guide",
    "",
    "Use skills when they match the task:",
    "",
    "- `kaine-alpha`: does alpha things.",
    "- `kaine-beta`: does beta things.",
    "",
    "Downstream products can add more skills."
  ].join("\n");

  it("passes when the guide list matches the skills on disk", () => {
    expect(lintGuideSkillList(guide, ["kaine-alpha", "kaine-beta"])).toEqual([]);
  });

  it("reports skills on disk that are missing from the guide list", () => {
    const issues = lintGuideSkillList(guide, ["kaine-alpha", "kaine-beta", "kaine-gamma"]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain("kaine-gamma");
  });

  it("reports guide entries with no matching skill file", () => {
    const issues = lintGuideSkillList(guide, ["kaine-alpha"]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain("kaine-beta");
  });

  it("errors when the guide skill list section is missing entirely", () => {
    const issues = lintGuideSkillList("# Guide with no skill list", ["kaine-alpha"]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
  });
});

describe("parseSkillFile", () => {
  it("parses minimal valid frontmatter", () => {
    const skill = parseSkillFile(
      "kaine-foo",
      "---\nname: kaine-foo\ndescription: Does foo.\n---\n\nBody.\n"
    );
    expect(skill.name).toBe("kaine-foo");
    expect(skill.description).toBe("Does foo.");
    expect(skill.agents).toEqual(["claude", "codex", "cursor", "opencode"]);
    expect(skill.isDefault).toBe(true);
    expect(skill.requiresEnv).toEqual([]);
    expect(skill.argumentHint).toBe("");
    expect(skill.model).toBeUndefined();
    expect(skill.effort).toBeUndefined();
    expect(skill.disableModelInvocation).toBeUndefined();
    expect(skill.body).toBe("Body.\n");
  });

  it("parses model, effort, disable-model-invocation", () => {
    const skill = parseSkillFile(
      "kaine-foo",
      baseFrontmatter("model: claude-sonnet-4-5\neffort: high\ndisable-model-invocation: true")
    );
    expect(skill.model).toBe("claude-sonnet-4-5");
    expect(skill.effort).toBe("high");
    expect(skill.disableModelInvocation).toBe(true);
  });

  it("rejects an invalid effort value", () => {
    expect(() => parseSkillFile("kaine-foo", baseFrontmatter("effort: extreme"))).toThrow(
      /'effort' must be one of/
    );
  });

  it("parses requires-env as YAML list", () => {
    const skill = parseSkillFile(
      "kaine-foo",
      baseFrontmatter("requires-env:\n  - JIRA_API_TOKEN\n  - JIRA_USERNAME")
    );
    expect(skill.requiresEnv).toEqual(["JIRA_API_TOKEN", "JIRA_USERNAME"]);
  });

  it("parses requires-env as comma-separated string", () => {
    const skill = parseSkillFile(
      "kaine-foo",
      baseFrontmatter("requires-env: JIRA_API_TOKEN, JIRA_USERNAME")
    );
    expect(skill.requiresEnv).toEqual(["JIRA_API_TOKEN", "JIRA_USERNAME"]);
  });

  it("parses agents as YAML list and rejects unknown values", () => {
    const skill = parseSkillFile("kaine-foo", baseFrontmatter("agents: [claude, codex]"));
    expect(skill.agents).toEqual(["claude", "codex"]);
    expect(() => parseSkillFile("kaine-foo", baseFrontmatter("agents: [claude, gemini]"))).toThrow(
      /unknown agent 'gemini'/
    );
  });

  it("default false marks the skill opt-in", () => {
    const skill = parseSkillFile("kaine-foo", baseFrontmatter("default: false"));
    expect(skill.isDefault).toBe(false);
  });

  it("errors when frontmatter is missing", () => {
    expect(() => parseSkillFile("kaine-foo", "no frontmatter here")).toThrow(
      /missing YAML frontmatter/
    );
  });

  it("errors when name in frontmatter does not match filename", () => {
    expect(() =>
      parseSkillFile("kaine-foo", "---\nname: kaine-bar\ndescription: x\n---\n\nBody.")
    ).toThrow(/does not match file name/);
  });

  it("errors when required fields are missing", () => {
    expect(() => parseSkillFile("kaine-foo", "---\ndescription: x\n---\n\nBody.")).toThrow(
      /frontmatter missing 'name'/
    );
    expect(() => parseSkillFile("kaine-foo", "---\nname: kaine-foo\n---\n\nBody.")).toThrow(
      /frontmatter missing 'description'/
    );
  });

  it("rejects whitespace inside requires-env values", () => {
    expect(() => parseSkillFile("kaine-foo", baseFrontmatter("requires-env: FOO BAR"))).toThrow(
      /whitespace/
    );
    expect(() =>
      parseSkillFile("kaine-foo", baseFrontmatter('requires-env:\n  - "FOO BAR"'))
    ).toThrow(/whitespace/);
  });

  it("parses files with Windows CRLF line endings", () => {
    const crlf = "---\r\nname: kaine-foo\r\ndescription: Does foo.\r\n---\r\n\r\nBody.\r\n";
    const skill = parseSkillFile("kaine-foo", crlf);
    expect(skill.name).toBe("kaine-foo");
    expect(skill.body.trim()).toBe("Body.");
  });
});

describe("renderers", () => {
  const skill = parseSkillFile(
    "kaine-foo",
    baseFrontmatter("model: claude-sonnet-4-5\nargument-hint: <ticket>")
  );

  it("renderCursorSkill keeps frontmatter verbatim", () => {
    const output = renderCursorSkill(skill);
    expect(output).toContain("model: claude-sonnet-4-5");
    expect(output).toContain("argument-hint: <ticket>");
    expect(output).toContain("GENERATED FILE");
  });

  it("renderOpencodeSkill strips to name and description", () => {
    const output = renderOpencodeSkill(skill);
    expect(output).toContain("name: kaine-foo");
    expect(output).toContain("description: Does foo.");
    expect(output).not.toContain("model:");
    expect(output).not.toContain("argument-hint:");
  });
});

describe("renderCursorRulesFile", () => {
  it("inserts the generated marker after frontmatter", () => {
    const result = renderCursorRulesFile("---\ndescription: x\n---\n\nBody.\n");
    expect(result).toBe(
      "---\ndescription: x\n---\n<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->\n\nBody.\n"
    );
  });

  it("throws when frontmatter is missing", () => {
    expect(() => renderCursorRulesFile("no frontmatter")).toThrow(/missing YAML frontmatter/);
  });
});

describe("renderAgentDoc", () => {
  it("appends the skill index to the guide", () => {
    const output = renderAgentDoc("# Guide\n\nHello.", [
      parseSkillFile("kaine-foo", "---\nname: kaine-foo\ndescription: Does foo.\n---\n\nBody.")
    ]);
    expect(output).toContain("# Guide");
    expect(output).toContain("## Generated Skills Index");
    expect(output).toContain("- `kaine-foo`: Does foo.");
  });

  it("renders the Claude import file", () => {
    expect(renderClaudeImport()).toBe("@AGENTS.md\n");
  });
});

describe("serena renderers", () => {
  it("renders the Serena project with the generated header", () => {
    expect(renderSerenaProject("project: true\n")).toBe(
      "# GENERATED FILE. Do not edit directly. Run: pnpm ai:install\n\nproject: true\n"
    );
  });

  it("renders Serena memories with the generated header", () => {
    expect(renderSerenaMemory("# Memory\n")).toBe(
      "<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->\n\n# Memory\n"
    );
  });
});

describe("renderReviewDoc", () => {
  it("wraps the source with the HTML generated-file notice", () => {
    expect(renderReviewDoc("# Review\n\nBody.")).toBe(
      "<!-- GENERATED FILE. Do not edit directly. Run: pnpm ai:install -->\n\n# Review\n\nBody.\n"
    );
  });

  it("trims surrounding whitespace on the source body", () => {
    expect(renderReviewDoc("\n\n## Correctness\n\n- x\n\n")).toContain("## Correctness\n\n- x\n");
    expect(renderReviewDoc("\n\n## Correctness\n\n- x\n\n").startsWith("<!--")).toBe(true);
  });
});

describe("REVIEW_REQUIRED_HEADINGS", () => {
  it("lists the eight compact-hybrid headings in order", () => {
    expect([...REVIEW_REQUIRED_HEADINGS]).toEqual([
      "Correctness",
      "Security, Auth & Tenancy",
      "Architecture & Boundaries",
      "Data & GraphQL",
      "UI & i18n",
      "Quality Gates",
      "Domain Language",
      "Template & AI Hygiene"
    ]);
  });
});

describe("renderMcpJson", () => {
  it("emits the generated marker and the source", () => {
    const json = renderMcpJson({
      mcpServers: { foo: { command: "foo-bin" } }
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed._generated).toMatch(/GENERATED FILE/);
    expect(parsed.mcpServers).toEqual({ foo: { command: "foo-bin" } });
  });
});

describe("renderCodexConfig", () => {
  it("emits TOML sections for each server with env subsection", () => {
    const toml = renderCodexConfig({
      mcpServers: {
        foo: {
          command: "foo-bin",
          args: ["--flag"],
          env: { TOKEN: "abc" }
        }
      }
    });
    expect(toml).toContain("[mcp_servers.foo]");
    expect(toml).toContain('command = "foo-bin"');
    expect(toml).toContain('args = ["--flag"]');
    expect(toml).toContain("[mcp_servers.foo.env]");
    expect(toml).toContain('TOKEN = "abc"');
  });

  it("emits valid TOML for server names with hyphens", () => {
    const toml = renderCodexConfig({
      mcpServers: {
        "mcp-atlassian": {
          command: "uvx",
          args: ["mcp-atlassian"],
          env: { TOKEN: "abc" }
        }
      }
    });
    expect(toml).toContain("[mcp_servers.mcp-atlassian]");
    expect(toml).toContain("[mcp_servers.mcp-atlassian.env]");
  });

  it("installs the Codex SessionStart hook", () => {
    const toml = renderCodexConfig({
      mcpServers: { foo: { command: "foo-bin" } }
    });
    expect(toml).toContain("[features]");
    expect(toml).toContain("hooks = true");
    expect(toml).not.toContain("codex_hooks = true");
    expect(toml).toContain("[[hooks.SessionStart]]");
    expect(toml).toContain('matcher = "startup|resume"');
    expect(toml).toContain("[[hooks.SessionStart.hooks]]");
    expect(toml).toContain('type = "command"');
    expect(toml).toContain(
      'command = "node \\"$(git rev-parse --show-toplevel)/.ai/hooks/session-start.mjs\\" --agent codex"'
    );
  });
});

describe("renderClaudeSettings", () => {
  it("installs Serena and AI context SessionStart hooks", () => {
    const settings = JSON.parse(renderClaudeSettings()) as {
      hooks: {
        SessionStart: Array<{
          matcher?: string;
          hooks: Array<{ type: string; command: string; statusMessage?: string }>;
        }>;
      };
    };

    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.SessionStart[0]?.hooks[0]?.command).toContain(
      "serena prompts print-cc-system-prompt-override"
    );
    expect(settings.hooks.SessionStart[1]).toEqual({
      matcher: "startup|resume",
      hooks: [
        {
          type: "command",
          command:
            'node "$(git rev-parse --show-toplevel)/.ai/hooks/session-start.mjs" --agent claude',
          statusMessage: "Loading Kaine Forge AI context"
        }
      ]
    });
  });
});

describe("publicMcpServer", () => {
  it("drops private fields like default and agents", () => {
    const result = publicMcpServer({
      command: "foo-bin",
      args: ["--x"],
      env: { TOKEN: "abc" },
      default: false,
      agents: ["claude"]
    });
    expect(result).toEqual({
      command: "foo-bin",
      args: ["--x"],
      env: { TOKEN: "abc" }
    });
  });
});

describe("referencedEnvVars", () => {
  it("extracts variable placeholders", () => {
    expect(referencedEnvVars("use ${TOKEN} and ${URL:-https://example.com}")).toEqual([
      "TOKEN",
      "URL"
    ]);
  });

  it("returns an empty array when no placeholders are present", () => {
    expect(referencedEnvVars("plain text")).toEqual([]);
  });
});

describe("renderOpencodeConfig", () => {
  it("emits opencode config with local command arrays", () => {
    const json = renderOpencodeConfig({
      mcpServers: {
        foo: { command: "foo-bin", args: ["--flag"] },
        bar: { command: "bar-bin", env: { KEY: "value" } }
      }
    });
    const parsed = JSON.parse(json) as {
      $schema: string;
      mcp: Record<
        string,
        {
          command: string[];
          enabled: boolean;
          environment?: Record<string, string>;
          type: string;
        }
      >;
    };
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.mcp.foo).toEqual({
      type: "local",
      command: ["foo-bin", "--flag"],
      enabled: true
    });
    expect(parsed.mcp.bar).toEqual({
      type: "local",
      command: ["bar-bin"],
      enabled: true,
      environment: { KEY: "value" }
    });
  });

  it("skips servers without a command", () => {
    const json = renderOpencodeConfig({
      mcpServers: { broken: { args: ["x"] } }
    });
    const parsed = JSON.parse(json) as { mcp: Record<string, unknown> };
    expect(parsed.mcp).toEqual({});
  });
});

describe("mergeMcpSources", () => {
  it("adds personal entries that do not collide and tracks them", () => {
    const merged = mergeMcpSources(
      { mcpServers: { team: { command: "t" } } },
      { mcpServers: { mine: { command: "m" } } }
    );
    expect(Object.keys(merged.source.mcpServers).sort()).toEqual(["mine", "team"]);
    expect([...merged.personalNames]).toEqual(["mine"]);
    expect(merged.collisions).toEqual([]);
  });

  it("reports collisions and keeps team entries on conflicts", () => {
    const merged = mergeMcpSources(
      { mcpServers: { shared: { command: "t" } } },
      { mcpServers: { shared: { command: "m" } } }
    );
    expect(merged.collisions).toEqual(["shared"]);
    expect(merged.source.mcpServers.shared).toEqual({ command: "t" });
  });
});

describe("resolveInstallMcpSource", () => {
  it("keeps compatible personal MCPs when explicit team MCPs are selected", () => {
    const resolved = resolveInstallMcpSource(
      {
        mcpServers: {
          context7: { command: "context7-bin", agents: ["codex"] },
          firecrawl: { command: "firecrawl-bin", default: false, agents: ["codex"] },
          personal: { command: "personal-bin", agents: ["codex"] },
          "personal-claude": { command: "personal-claude-bin", agents: ["claude"] }
        }
      },
      {
        agent: "codex",
        mcps: ["context7"],
        personalNames: new Set(["personal", "personal-claude"]),
        localEnv: {}
      }
    );

    expect(Object.keys(resolved.source.mcpServers).sort()).toEqual(["context7", "personal"]);
  });

  it("keeps team opt-in MCPs opt-in by default", () => {
    const resolved = resolveInstallMcpSource(
      {
        mcpServers: {
          context7: { command: "context7-bin" },
          firecrawl: { command: "firecrawl-bin", default: false }
        }
      },
      {
        agent: "codex",
        mcps: [],
        personalNames: new Set(),
        localEnv: {}
      }
    );

    expect(Object.keys(resolved.source.mcpServers)).toEqual(["context7"]);
  });
});

describe("parseAgentDefinitionFile", () => {
  it("parses name, description, frontmatter, and body", () => {
    const def = parseAgentDefinitionFile("kaine-implementer", agentDef("kaine-implementer"));
    expect(def.name).toBe("kaine-implementer");
    expect(def.description).toBe("Does agent things.");
    expect(def.frontmatterRaw).toContain("name: kaine-implementer");
    expect(def.frontmatterRaw).toContain("model: inherit");
    expect(def.body).toBe("System prompt.\n");
  });

  it("errors when the name does not match the file name", () => {
    expect(() => parseAgentDefinitionFile("kaine-implementer", agentDef("kaine-explorer"))).toThrow(
      /does not match file name/
    );
  });

  it("errors when required fields are missing", () => {
    expect(() =>
      parseAgentDefinitionFile("kaine-foo", "---\ndescription: x\n---\n\nBody.")
    ).toThrow(/missing 'name'/);
    expect(() =>
      parseAgentDefinitionFile("kaine-foo", "---\nname: kaine-foo\n---\n\nBody.")
    ).toThrow(/missing 'description'/);
  });

  it("errors when the body is empty", () => {
    expect(() =>
      parseAgentDefinitionFile("kaine-foo", "---\nname: kaine-foo\ndescription: x\n---\n\n")
    ).toThrow(/body is empty/);
  });

  it("errors when frontmatter is missing", () => {
    expect(() => parseAgentDefinitionFile("kaine-foo", "no frontmatter here")).toThrow(
      /missing YAML frontmatter/
    );
  });
});

describe("renderClaudeAgentDefinition", () => {
  it("round-trips frontmatter and body with a trailing newline", () => {
    const def = parseAgentDefinitionFile("kaine-implementer", agentDef("kaine-implementer"));
    const output = renderClaudeAgentDefinition(def);
    expect(output).toBe(
      "---\nname: kaine-implementer\ndescription: Does agent things.\nmodel: inherit\n---\nSystem prompt.\n"
    );
    expect(output.endsWith("\n")).toBe(true);
  });
});

describe("discoverAgentDefinitions", () => {
  const withAgentsDir = (fn: (dir: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "kaine-agents-"));
    const dir = join(root, "agents");
    mkdirSync(dir, { recursive: true });
    try {
      fn(dir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("returns definitions sorted by name", () => {
    withAgentsDir((dir) => {
      writeFileSync(join(dir, "kaine-implementer.md"), agentDef("kaine-implementer"));
      writeFileSync(join(dir, "kaine-explorer.md"), agentDef("kaine-explorer"));
      const defs = discoverAgentDefinitions(dir);
      expect(defs.map((def) => def.name)).toEqual(["kaine-explorer", "kaine-implementer"]);
    });
  });

  it("rejects a non-kaine name", () => {
    withAgentsDir((dir) => {
      writeFileSync(join(dir, "helper.md"), agentDef("helper"));
      expect(() => discoverAgentDefinitions(dir)).toThrow(/must start with 'kaine-'/);
    });
  });

  it("returns an empty list when the directory is missing", () => {
    expect(discoverAgentDefinitions(join(tmpdir(), "kaine-agents-missing-xyz"))).toEqual([]);
  });
});

describe("lintAgentDefinitionsDir", () => {
  const withAgentsDir = (fn: (dir: string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "kaine-agents-lint-"));
    const dir = join(root, "agents");
    mkdirSync(dir, { recursive: true });
    try {
      fn(dir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("passes for a valid definition", () => {
    withAgentsDir((dir) => {
      writeFileSync(join(dir, "kaine-implementer.md"), agentDef("kaine-implementer"));
      expect(lintAgentDefinitionsDir(dir)).toEqual([]);
    });
  });

  it("flags a non-kaine name", () => {
    withAgentsDir((dir) => {
      writeFileSync(join(dir, "helper.md"), agentDef("helper"));
      const issues = lintAgentDefinitionsDir(dir);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.level).toBe("error");
      expect(issues[0]?.message).toContain("kaine-");
    });
  });

  it("flags an empty body", () => {
    withAgentsDir((dir) => {
      writeFileSync(
        join(dir, "kaine-implementer.md"),
        "---\nname: kaine-implementer\ndescription: x\n---\n\n"
      );
      const issues = lintAgentDefinitionsDir(dir);
      expect(
        issues.some((issue) => issue.level === "error" && /body is empty/.test(issue.message))
      ).toBe(true);
    });
  });
});

describe("computeAgentDefinitionDrift", () => {
  const withInstall = (
    fn: (dir: string, defs: ReturnType<typeof parseAgentDefinitionFile>[]) => void
  ): void => {
    const root = mkdtempSync(join(tmpdir(), "kaine-agents-drift-"));
    const dir = join(root, "agents");
    mkdirSync(dir, { recursive: true });
    const defs = [
      parseAgentDefinitionFile("kaine-implementer", agentDef("kaine-implementer")),
      parseAgentDefinitionFile("kaine-explorer", agentDef("kaine-explorer"))
    ];
    try {
      fn(dir, defs);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("reports no drift when installed files match canonical", () => {
    withInstall((dir, defs) => {
      for (const def of defs) {
        writeFileSync(join(dir, `${def.name}.md`), renderClaudeAgentDefinition(def));
      }
      const drift = computeAgentDefinitionDrift(defs, dir);
      expect(drift.missing).toEqual([]);
      expect(drift.stale).toEqual([]);
      expect(drift.orphan).toEqual([]);
    });
  });

  it("reports a mutated installed file as stale", () => {
    withInstall((dir, defs) => {
      for (const def of defs) {
        writeFileSync(join(dir, `${def.name}.md`), renderClaudeAgentDefinition(def));
      }
      writeFileSync(join(dir, "kaine-implementer.md"), "mutated\n");
      const drift = computeAgentDefinitionDrift(defs, dir);
      expect(drift.stale).toEqual(["kaine-implementer"]);
    });
  });

  it("reports a missing installed file", () => {
    withInstall((dir, defs) => {
      writeFileSync(
        join(dir, "kaine-explorer.md"),
        renderClaudeAgentDefinition(defs.find((def) => def.name === "kaine-explorer")!)
      );
      const drift = computeAgentDefinitionDrift(defs, dir);
      expect(drift.missing).toEqual(["kaine-implementer"]);
    });
  });

  it("reports a stray kaine- installed file as orphan", () => {
    withInstall((dir, defs) => {
      for (const def of defs) {
        writeFileSync(join(dir, `${def.name}.md`), renderClaudeAgentDefinition(def));
      }
      writeFileSync(join(dir, "kaine-stray.md"), "stray\n");
      const drift = computeAgentDefinitionDrift(defs, dir);
      expect(drift.orphan).toEqual(["kaine-stray"]);
    });
  });

  it("ignores non-kaine installed files", () => {
    withInstall((dir, defs) => {
      for (const def of defs) {
        writeFileSync(join(dir, `${def.name}.md`), renderClaudeAgentDefinition(def));
      }
      writeFileSync(join(dir, "my-personal-agent.md"), "personal\n");
      const drift = computeAgentDefinitionDrift(defs, dir);
      expect(drift.orphan).toEqual([]);
    });
  });
});

describe("missingEnvVarsForMcpServers", () => {
  it("reports missing env vars only for skipped MCP servers", () => {
    const missing = missingEnvVarsForMcpServers(
      {
        mcpServers: {
          skipped: {
            command: "skipped-bin",
            env: {
              TOKEN: "${SKIPPED_TOKEN}",
              URL: "${SKIPPED_URL:-https://example.com}"
            }
          },
          unrelated: {
            command: "unrelated-bin",
            env: {
              TOKEN: "${UNRELATED_TOKEN}"
            }
          }
        }
      },
      ["skipped"],
      {}
    );

    expect(missing).toEqual(["SKIPPED_TOKEN"]);
  });
});
