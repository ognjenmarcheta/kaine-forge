import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
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

import { installedServers } from "./readiness";

const hookScript = join(process.cwd(), ".ai", "hooks", "session-start.mjs");
const refreshScript = join(process.cwd(), ".ai", "hooks", "ai-refresh.mjs");

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

// A hook-provided CLAUDE_PROJECT_DIR would point the refresh at a real checkout.
const hookEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== "CLAUDE_PROJECT_DIR")
);

const runHook = (cwd: string, agent: "codex" | "claude" | "grok") =>
  spawnSync("node", [hookScript, "--agent", agent], {
    cwd,
    env: hookEnv,
    input: JSON.stringify({ cwd, hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8"
  });

const runPromptHook = (cwd: string) =>
  spawnSync("node", [refreshScript, "--agent", "claude"], {
    cwd,
    env: hookEnv,
    input: JSON.stringify({ cwd, hook_event_name: "UserPromptSubmit", prompt: "hi" }),
    encoding: "utf8"
  });

const runReadiness = (cwd: string): { problems: string[] } =>
  JSON.parse(
    spawnSync(
      process.execPath,
      ["--import", "tsx", ".ai/readiness.ts", "--agent", "claude", "--local", "--json"],
      { cwd, encoding: "utf8" }
    ).stdout
  );

/** A pull that changes one canonical skill. */
const changeCanonicalSkill = (repo: string): void => {
  const file = join(repo, ".ai/skills/kaine-test.md");
  writeFileSync(file, `${readFileSync(file, "utf8")}\nChanged verification requirement.\n`);
};

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
          "--serena-interface",
          "tools",
          "--non-interactive"
        ],
        { cwd: repo, stdio: "pipe" }
      );
      expect(runHook(repo, "claude").stdout).toContain("--prepare-serena");
      const server = installedServers("claude", repo).serena;
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
      // The cached prompt names classic tools only, so a REPL launch neither emits nor requests it.
      const args = (server.args ?? []).map((arg: string) => (arg === "tools" ? "REPL" : arg));
      writeFile(repo, ".mcp.json", JSON.stringify({ mcpServers: { serena: { ...server, args } } }));
      expect(runHook(repo, "claude").stdout).not.toMatch(
        /Synthetic cached prompt|--prepare-serena/
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);
  it("prints compact repo context when the AI install is healthy", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Kaine Forge AI context");
      expect(result.stdout).toContain("Branch: main");
      expect(result.stdout).toContain("AI installation: ready");
      expect(result.stdout).toContain("- Knowledge graph:");
      expect(result.stdout).not.toContain("pnpm ai:install");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it.each(["codex", "claude", "grok"] as const)(
    "warns when the %s AI install is missing",
    (agent) => {
      const repo = makeRepo();
      try {
        writeFile(repo, ".ai/guide.md");
        writeFile(repo, "AGENTS.md");
        writeFile(repo, "CLAUDE.md");
        const result = runHook(repo, agent);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain("AI installation: not-verified");
        expect(result.stdout).toContain("not verified at startup");
        expect(result.stdout).toContain(`pnpm ai:install --agent ${agent}`);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    }
  );

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

  it("reports content drift without timestamps or an MCP config, as in a worktree", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      changeCanonicalSkill(repo);
      const same = new Date("2024-01-01T00:00:00.000Z");
      utimesSync(join(repo, ".ai/skills/kaine-test.md"), same, same);
      utimesSync(join(repo, ".claude/skills/kaine-test/SKILL.md"), same, same);
      rmSync(join(repo, ".mcp.json"));

      const { problems } = runReadiness(repo);

      expect(problems).toContain("Stale skill: kaine-test");
      expect(problems).toContain("Missing claude MCP configuration");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("refreshes skills changed by a pull at session start and asks Claude to reload them", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      runHook(repo, "claude");
      changeCanonicalSkill(repo);

      const output = JSON.parse(runHook(repo, "claude").stdout).hookSpecificOutput;

      expect(output.reloadSkills).toBe(true);
      expect(output.additionalContext).toContain(
        "- AI setup refreshed (claude, codex, grok): ~kaine-test\n"
      );
      expect(output.additionalContext).toContain("AI installation: ready");
      expect(readFileSync(join(repo, ".claude/skills/kaine-test/SKILL.md"), "utf8")).toContain(
        "Changed verification requirement."
      );
      expect(runHook(repo, "claude").stdout).toMatch(/^Kaine Forge AI context\n/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("never writes tracked files during a refresh and names them instead", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      execFileSync("git", ["add", "AGENTS.md"], { cwd: repo });
      runHook(repo, "codex");
      const agentsDoc = readFileSync(join(repo, "AGENTS.md"), "utf8");
      writeFileSync(
        join(repo, ".ai/guide.md"),
        `${readFileSync(join(repo, ".ai/guide.md"), "utf8")}\nNew rule.\n`
      );

      const context = runHook(repo, "codex").stdout;

      expect(context).toContain(
        "- Tracked AI files are out of date: AGENTS.md. Run pnpm ai:install and commit.\n"
      );
      expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toBe(agentsDoc);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("leaves a checkout without a recorded install untouched", () => {
    const repo = makeRepo();
    try {
      cpSync(join(process.cwd(), ".ai"), join(repo, ".ai"), { recursive: true });
      symlinkSync(join(process.cwd(), "node_modules"), join(repo, "node_modules"), "junction");

      runHook(repo, "claude");

      expect(existsSync(join(repo, ".claude"))).toBe(false);
      expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("refreshes from the prompt hook only after .ai inputs change", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      runPromptHook(repo);
      const installed = join(repo, ".claude/skills/kaine-test");
      rmSync(installed, { recursive: true });

      expect(runPromptHook(repo).stdout).toBe("");
      expect(existsSync(installed)).toBe(false);

      changeCanonicalSkill(repo);

      expect(runPromptHook(repo).stdout).toContain("AI setup refreshed (claude, codex, grok):");
      expect(readFileSync(join(installed, "SKILL.md"), "utf8")).toContain(
        "Changed verification requirement."
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("warns a Claude worktree session when the main checkout's MCP servers differ or are missing", () => {
    const repo = makeRepo();
    const worktree = `${repo}-wt`;
    try {
      execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "init"],
        { cwd: repo, stdio: "ignore" }
      );
      execFileSync("git", ["worktree", "add", worktree], { cwd: repo, stdio: "ignore" });
      writeFile(repo, ".mcp.json", JSON.stringify({ mcpServers: { old: { command: "old" } } }));
      writeFile(worktree, ".mcp.json", JSON.stringify({ mcpServers: { new: { command: "new" } } }));

      const stale = runHook(worktree, "claude").stdout;
      expect(stale).toContain(join(repo, ".mcp.json"));
      expect(stale).toContain("run pnpm ai:install --agent claude in");
      expect(runHook(worktree, "codex").stdout).not.toContain(join(repo, ".mcp.json"));

      writeFile(worktree, ".mcp.json", JSON.stringify({ mcpServers: { old: { command: "old" } } }));
      expect(runHook(worktree, "claude").stdout).not.toContain(join(repo, ".mcp.json"));

      rmSync(join(repo, ".mcp.json"));
      expect(runHook(worktree, "claude").stdout).toContain(join(repo, ".mcp.json"));
    } finally {
      rmSync(worktree, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);
  it("warns a Claude worktree session that Serena serves the main checkout", () => {
    const repo = makeRepo();
    const worktree = `${repo}-wt`;
    try {
      execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--allow-empty", "-m", "init"],
        { cwd: repo, stdio: "ignore" }
      );
      execFileSync("git", ["worktree", "add", worktree], { cwd: repo, stdio: "ignore" });
      const serena = JSON.stringify({ mcpServers: { serena: { command: "uvx" } } });
      writeFile(repo, ".mcp.json", serena);
      writeFile(worktree, ".mcp.json", serena);
      const warning = `so Serena reads and edits ${repo}, not this worktree.`;

      expect(runHook(worktree, "claude").stdout).toContain(warning);
      expect(runHook(worktree, "codex").stdout).not.toContain(warning);
      expect(runHook(repo, "claude").stdout).not.toContain("Serena reads and edits");

      writeFile(
        repo,
        ".mcp.json",
        JSON.stringify({ mcpServers: { serena: { command: "uvx", disabled: true } } })
      );
      expect(runHook(worktree, "claude").stdout).not.toContain(warning);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

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
