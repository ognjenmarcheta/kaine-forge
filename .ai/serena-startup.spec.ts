import { execFileSync } from "node:child_process";
import {
  cpSync,
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
import { parse as parseYaml } from "yaml";

import {
  checkSerenaProjectSemantics,
  mergeSerenaWorkspaceFolders,
  readMcpSource,
  resolveInstallMcpSource
} from "./ai.util";
import { installedServers } from "./readiness";

it.each(["codex", "claude"] as const)(
  "binds %s Serena to the workspace with its native context",
  (agent) => {
    const source = readMcpSource();
    const previousArgs = [...(source.mcpServers.serena?.args ?? [])];
    const installed = resolveInstallMcpSource(source, {
      agent,
      mcps: ["serena"],
      personalNames: new Set(),
      localEnv: {}
    }).source.mcpServers.serena;
    expect(installed?.args).toContain("--project-from-cwd");
    expect(
      installed?.args?.slice(
        installed.args.indexOf("--context"),
        installed.args.indexOf("--context") + 2
      )
    ).toEqual(["--context", agent === "codex" ? "codex" : "claude-code"]);
    expect(installed?.args?.[1]).toBe(previousArgs[1]);
    expect(source.mcpServers.serena?.args).toEqual(previousArgs);
  }
);

it("preserves a personal Serena launch and other personal servers", () => {
  const serena = { command: "personal-serena", args: ["--context", "mine"] };
  const source = { mcpServers: { serena, personal: { command: "local", args: ["mine"] } } };
  const result = resolveInstallMcpSource(source, {
    agent: "codex",
    mcps: ["serena"],
    personalNames: new Set(["serena", "personal"]),
    localEnv: {}
  });
  expect(result.source).toEqual(source);
});

it("keeps installation and readiness aligned without changing selections or personal settings", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-serena-install-"));
  const run = (script: string, args: string[]) =>
    execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe"
    });
  try {
    cpSync(path.join(process.cwd(), ".ai"), path.join(root, ".ai"), { recursive: true });
    symlinkSync(
      path.join(process.cwd(), "node_modules"),
      path.join(root, "node_modules"),
      "junction"
    );
    mkdirSync(path.join(root, ".codex"));
    writeFileSync(
      path.join(root, ".codex/config.toml"),
      'model = "personal-model"\n[mcp_servers.personal]\ncommand = "node"\n'
    );
    run(".ai/install.ts", [
      "--agent",
      "codex",
      "--agent",
      "claude",
      "--mcp",
      "serena",
      "--non-interactive"
    ]);
    const firstCodex = readFileSync(path.join(root, ".codex/config.toml"), "utf8");
    const firstClaude = readFileSync(path.join(root, ".mcp.json"), "utf8");
    expect(firstCodex).toContain('model = "personal-model"');
    expect(installedServers("codex", root).personal?.command).toBe("node");
    for (const agent of ["codex", "claude"] as const) {
      const report = JSON.parse(run(".ai/readiness.ts", ["--agent", agent, "--local", "--json"]));
      expect(report.installation).toBe("ready");
      expect(report.problems).toEqual([]);
      expect(report.runtime.mcp).toBe("not-verified");
    }
    run(".ai/install.ts", ["--agent", "codex", "--agent", "claude", "--non-interactive"]);
    expect(readFileSync(path.join(root, ".codex/config.toml"), "utf8")).toBe(firstCodex);
    expect(readFileSync(path.join(root, ".mcp.json"), "utf8")).toBe(firstClaude);
    expect(installedServers("claude", root).serena?.args).toContain("claude-code");
    expect(installedServers("codex", root).serena?.args).toContain("codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

it("adds existing workspace roots without reverting Serena migrations, comments, or custom roots", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-serena-workspaces-"));
  const seed =
    "project_name: kaine-forge\nlanguage_servers: [typescript]\nls_additional_workspace_folders: [apps/web, apps/mobile]\n";
  const previous =
    "# personal comment\nproject_name: kaine-forge\nlanguage_servers: [typescript]\nactivation_command_timeout: 180.0\nls_additional_workspace_folders:\n  - external # keep this comment\n";
  try {
    mkdirSync(path.join(root, "apps/web"), { recursive: true });
    writeFileSync(path.join(root, "apps/web/tsconfig.json"), "{}");
    const merged = mergeSerenaWorkspaceFolders(seed, previous, root);
    expect(parseYaml(merged)).toMatchObject({
      activation_command_timeout: 180,
      ls_additional_workspace_folders: ["external", "apps/web"]
    });
    expect(merged).toContain("# personal comment");
    expect(merged).toContain("# keep this comment");
    expect(mergeSerenaWorkspaceFolders(seed, merged, root)).toBe(merged);
    expect(checkSerenaProjectSemantics(seed, previous, root)).toEqual([
      'workspace folder "apps/web" is not configured'
    ]);
    expect(checkSerenaProjectSemantics(seed, merged, root)).toEqual([]);
    expect(() =>
      mergeSerenaWorkspaceFolders(seed, "ls_additional_workspace_folders: personal", root)
    ).toThrow("Invalid installed Serena workspace folders");
    expect(() => mergeSerenaWorkspaceFolders(seed, "a: [unclosed", root)).toThrow(
      "Invalid installed Serena project YAML"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
