import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readMcpSource } from "./ai.util";

const hookScript = join(process.cwd(), ".ai", "hooks", "session-start.mjs");

const makeRepo = (): string => {
  const repo = mkdtempSync(join(tmpdir(), "kaine-hook-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
  return repo;
};

const writeFile = (repo: string, path: string, content = "x\n"): void => {
  const file = join(repo, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
};

const makeHealthyAiInstall = (repo: string): void => {
  cpSync(join(process.cwd(), ".ai"), join(repo, ".ai"), { recursive: true });
  symlinkSync(join(process.cwd(), "node_modules"), join(repo, "node_modules"), "junction");
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      ".ai/install.ts",
      "--agent",
      "codex,claude,grok",
      "--mcp",
      "filesystem",
      "--non-interactive"
    ],
    { cwd: repo, stdio: "pipe" }
  );
};

const runHook = (cwd: string, agent: "codex" | "claude" | "grok") =>
  spawnSync("node", [hookScript, "--agent", agent], {
    cwd,
    input: JSON.stringify({ cwd, hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8"
  });

describe("session-start hook", () => {
  it("emits only current selected Serena cache content without a Serena startup command", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          ".ai/install.ts",
          "--agent",
          "claude",
          "--mcp",
          "serena",
          "--non-interactive"
        ],
        { cwd: repo, stdio: "pipe" }
      );
      expect(runHook(repo, "claude").stdout).toContain("--prepare-serena");
      const server = readMcpSource().mcpServers.serena;
      if (!server) throw new Error("Missing Serena definition");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([server.command, server.args ?? []]))
        .digest("hex");
      writeFile(
        repo,
        ".ai.local/serena/claude-prompt.json",
        JSON.stringify({ schemaVersion: 1, fingerprint, prompt: "Synthetic cached prompt" })
      );
      expect(runHook(repo, "claude").stdout).toContain("Synthetic cached prompt");
      const settings = readFileSync(join(repo, ".claude/settings.json"), "utf8");
      expect(settings).not.toMatch(/uvx|npx|git\+/);
      writeFile(
        repo,
        ".mcp.json",
        JSON.stringify({
          mcpServers: { serena: { ...server, args: [...(server.args ?? []), "--changed"] } }
        })
      );
      const changedLaunch = runHook(repo, "claude").stdout;
      expect(changedLaunch).not.toContain("Synthetic cached prompt");
      expect(changedLaunch).toContain("--prepare-serena");
      writeFile(
        repo,
        ".mcp.json",
        JSON.stringify({ mcpServers: { serena: { ...server, disabled: true } } })
      );
      expect(runHook(repo, "claude").stdout).not.toMatch(
        /Synthetic cached prompt|--prepare-serena/
      );
      writeFile(repo, ".mcp.json", JSON.stringify({ mcpServers: { serena: server } }));
      writeFile(
        repo,
        ".ai.local/serena/claude-prompt.json",
        JSON.stringify({ schemaVersion: 1, fingerprint: "old", prompt: "Synthetic cached prompt" })
      );
      const stale = runHook(repo, "claude").stdout;
      expect(stale).not.toContain("Synthetic cached prompt");
      expect(stale).toContain("--prepare-serena");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
  it("prints compact repo context when the AI install is healthy", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Kaine Forge AI context");
      expect(result.stdout).toContain("Branch: main");
      expect(result.stdout).toContain("AI installation: ready");
      expect(result.stdout).not.toContain("pnpm ai:install");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("warns when the Codex AI install is missing", () => {
    const repo = makeRepo();
    try {
      writeFile(repo, ".ai/guide.md");
      writeFile(repo, "AGENTS.md");
      writeFile(repo, "CLAUDE.md");
      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("AI installation: not-verified");
      expect(result.stdout).toContain("not verified at startup");
      expect(result.stdout).toContain("pnpm ai:install --agent codex");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("warns when the Claude AI install is missing", () => {
    const repo = makeRepo();
    try {
      writeFile(repo, ".ai/guide.md");
      writeFile(repo, "AGENTS.md");
      writeFile(repo, "CLAUDE.md");
      const result = runHook(repo, "claude");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("AI installation: not-verified");
      expect(result.stdout).toContain("not verified at startup");
      expect(result.stdout).toContain("pnpm ai:install --agent claude");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("warns when the Grok AI install is missing", () => {
    const repo = makeRepo();
    try {
      writeFile(repo, ".ai/guide.md");
      writeFile(repo, "AGENTS.md");
      writeFile(repo, "CLAUDE.md");
      const result = runHook(repo, "grok");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("AI installation: not-verified");
      expect(result.stdout).toContain("not verified at startup");
      expect(result.stdout).toContain("pnpm ai:install --agent grok");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("prints healthy context for a complete Grok install", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const result = runHook(repo, "grok");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("AI installation: ready");
      expect(result.stdout).not.toContain("pnpm ai:install");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("detects changed canonical content even with unchanged timestamps", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const file = join(repo, ".ai/skills/kaine-test.md");
      const content = readFileSync(file, "utf8");
      writeFileSync(file, `${content}\nChanged verification requirement.\n`);
      const same = new Date("2024-01-01T00:00:00.000Z");
      utimesSync(file, same, same);
      utimesSync(join(repo, ".agents/skills/kaine-test/SKILL.md"), same, same);

      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Stale skill: kaine-test");
      execFileSync(
        process.execPath,
        ["--import", "tsx", ".ai/install.ts", "--agent", "codex", "--non-interactive"],
        { cwd: repo, stdio: "pipe" }
      );
      expect(runHook(repo, "codex").stdout).toContain("AI installation: ready");
      expect(result.stdout).toContain("pnpm ai:install --agent codex");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("exits cleanly outside a git repository", () => {
    const cwd = mkdtempSync(join(tmpdir(), "kaine-hook-no-repo-"));
    try {
      const result = runHook(cwd, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

it("keeps explicit skill/MCP subsets across unflagged regeneration", () => {
  const repo = makeRepo();
  try {
    makeHealthyAiInstall(repo);
    const install = (args: string[]) =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", ".ai/install.ts", "--agent", "codex", "--non-interactive", ...args],
        { cwd: repo, stdio: "pipe" }
      );
    install(["--skill", "kaine-test", "--mcp", "filesystem"]);
    rmSync(join(repo, ".codex/config.toml"));
    install([]);
    const selection = JSON.parse(
      readFileSync(join(repo, ".ai.local/installations/codex.json"), "utf8")
    );
    expect(selection).toMatchObject({ skills: ["kaine-test"], mcps: ["filesystem"] });
    expect(runHook(repo, "codex").stdout).toContain("AI installation: ready");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
