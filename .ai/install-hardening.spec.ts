import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { discoverAgentDefinitions, renderClaudeAgentDefinition } from "./ai.util";
import { mergeInstalledConfig } from "./install-config.util";
import {
  chooseInstallSelection,
  managedMcpOwnership,
  readInstallSelection,
  writeInstallSelection
} from "./install-state.util";

it("distinguishes fresh defaults, recorded emptiness, legacy subsets and interactive picks", () => {
  const base = { explicit: [], detected: [], defaults: ["default"] };
  expect(chooseInstallSelection(base).names).toEqual(["default"]);
  expect(chooseInstallSelection({ ...base, recorded: [] }).names).toEqual([]);
  expect(chooseInstallSelection({ ...base, detected: ["legacy"] }).names).toEqual(["legacy"]);
  expect(chooseInstallSelection({ ...base, recorded: ["old"], interactive: true }).names).toEqual([
    "default"
  ]);
  expect(
    chooseInstallSelection({ ...base, recorded: ["old"], explicit: ["chosen"] }).names
  ).toEqual(["chosen"]);
});

it("revokes owned MCPs and preserves explicit personal overrides and ambiguous legacy entries", () => {
  const old = { schemaVersion: 2, skills: [], mcps: ["retired"], ownedMcps: ["retired"] } as const;
  const previous = { ...old, skills: [], mcps: ["retired"], ownedMcps: ["retired"] };
  expect(managedMcpOwnership(previous, ["current"], new Set())).toEqual(["current", "retired"]);
  expect(managedMcpOwnership(previous, ["current"], new Set(["retired"]))).toEqual(["current"]);
  const config = '{"mcpServers":{"retired":{"command":"old"},"personal":{"command":"mine"}}}';
  expect(JSON.parse(mergeInstalledConfig(config, '{"mcpServers":{}}', false, ["retired"]))).toEqual(
    { mcpServers: { personal: { command: "mine" } } }
  );
  expect(
    managedMcpOwnership({ schemaVersion: 1, skills: [], mcps: ["unknown"] }, ["current"], new Set())
  ).toEqual(["current"]);
});

it.each([false, true])(
  "installs defaults and retains selections across prerequisite loss and revocation (personal=%s)",
  (personal) => {
    const root = mkdtempSync(path.join(tmpdir(), "kaine-install-test-"));
    const install = (env: NodeJS.ProcessEnv = process.env) =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", ".ai/install.ts", "--agent", "claude", "--non-interactive"],
        { cwd: root, env, stdio: "pipe" }
      );
    try {
      cpSync(path.join(process.cwd(), ".ai"), path.join(root, ".ai"), { recursive: true });
      symlinkSync(
        path.join(process.cwd(), "node_modules"),
        path.join(root, "node_modules"),
        "junction"
      );
      mkdirSync(path.join(root, ".claude/skills"), { recursive: true });
      if (personal) {
        mkdirSync(path.join(root, ".claude/skills/personal"));
        writeFileSync(path.join(root, ".claude/skills/personal/SKILL.md"), "personal");
      }
      writeFileSync(
        path.join(root, ".mcp.json"),
        JSON.stringify({ mcpServers: personal ? { personal: { command: "local" } } : {} })
      );
      writeFileSync(
        path.join(root, ".ai/skills/kaine-env-control.md"),
        "---\nname: kaine-env-control\ndescription: Synthetic environment control.\nrequires-env: [KAINE_TEST_SKILL_TOKEN]\n---\nControl\n"
      );
      install({ ...process.env, KAINE_TEST_SKILL_TOKEN: "" });
      const first = readInstallSelection("claude", root);
      expect(first?.schemaVersion).toBe(2);
      expect(first?.skills).toContain("kaine-test");
      expect(first?.skills).toContain("kaine-env-control");
      expect(first?.mcps).toContain("filesystem");
      const skill = path.join(root, ".claude/skills/kaine-env-control/SKILL.md");
      expect(existsSync(skill)).toBe(false);
      install({ ...process.env, KAINE_TEST_SKILL_TOKEN: "synthetic" });
      expect(existsSync(skill)).toBe(true);
      install({ ...process.env, KAINE_TEST_SKILL_TOKEN: "" });
      expect(existsSync(skill)).toBe(true);
      expect(readInstallSelection("claude", root)?.skills).toContain("kaine-env-control");
      const readiness = spawnSync(
        process.execPath,
        ["--import", "tsx", ".ai/readiness.ts", "--agent", "claude", "--local", "--json"],
        { cwd: root, encoding: "utf8", env: { ...process.env, KAINE_TEST_SKILL_TOKEN: "" } }
      );
      expect(readiness.status).toBe(1);
      expect(JSON.parse(readiness.stdout).problems).toContain(
        "kaine-env-control: missing KAINE_TEST_SKILL_TOKEN"
      );
      // Remove a formerly installed team server; the names-only ownership record survives source removal.
      writeFileSync(path.join(root, ".ai/mcp.json"), '{"mcpServers":{}}');
      install();
      expect(JSON.parse(readFileSync(path.join(root, ".mcp.json"), "utf8")).mcpServers).toEqual(
        personal ? { personal: { command: "local" } } : {}
      );
      if (personal)
        expect(readFileSync(path.join(root, ".claude/skills/personal/SKILL.md"), "utf8")).toBe(
          "personal"
        );
      writeInstallSelection("claude", { schemaVersion: 1, skills: [], mcps: [] }, root);
      install();
      expect(readInstallSelection("claude", root)).toMatchObject({ schemaVersion: 2, skills: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  30_000
);

it("limits the installed explorer to read/search tools", () => {
  const definition = discoverAgentDefinitions().find((entry) => entry.name === "kaine-explorer");
  if (!definition) throw new Error("Missing explorer");
  expect(renderClaudeAgentDefinition(definition)).toContain("tools: Read, Grep, Glob\n");
  expect(definition.frontmatterRaw).not.toContain("disallowedTools");
});
