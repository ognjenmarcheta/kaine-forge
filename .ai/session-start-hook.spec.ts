import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  writeFile(repo, ".ai/guide.md");
  writeFile(repo, ".ai/skills/kaine-test.md");
  writeFile(repo, "AGENTS.md");
  writeFile(repo, "CLAUDE.md");
  writeFile(repo, ".codex/config.toml");
  writeFile(repo, ".agents/skills/kaine-test/SKILL.md");
  writeFile(repo, ".mcp.json");
  writeFile(repo, ".claude/skills/kaine-test/SKILL.md");
  writeFile(repo, ".grok/config.toml");
  writeFile(repo, ".grok/skills/kaine-test/SKILL.md");
};

const runHook = (cwd: string, agent: "codex" | "claude" | "grok") =>
  spawnSync("node", [hookScript, "--agent", agent], {
    cwd,
    input: JSON.stringify({ cwd, hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8"
  });

describe("session-start hook", () => {
  it("prints compact repo context when the AI install is healthy", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Kaine Forge AI context");
      expect(result.stdout).toContain("Branch: main");
      expect(result.stdout).toContain("AI setup: healthy");
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
      expect(result.stdout).toContain("AI setup: needs attention");
      expect(result.stdout).toContain("Missing Codex config");
      expect(result.stdout).toContain("Missing Codex skills");
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
      expect(result.stdout).toContain("AI setup: needs attention");
      expect(result.stdout).toContain("Missing Claude MCP config");
      expect(result.stdout).toContain("Missing Claude skills");
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
      expect(result.stdout).toContain("AI setup: needs attention");
      expect(result.stdout).toContain("Missing Grok config");
      expect(result.stdout).toContain("Missing Grok skills");
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
      expect(result.stdout).toContain("AI setup: healthy");
      expect(result.stdout).not.toContain("pnpm ai:install");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("warns when canonical AI sources are newer than generated docs", () => {
    const repo = makeRepo();
    try {
      makeHealthyAiInstall(repo);
      const older = new Date("2024-01-01T00:00:00.000Z");
      const newer = new Date("2024-01-02T00:00:00.000Z");
      utimesSync(join(repo, "AGENTS.md"), older, older);
      utimesSync(join(repo, "CLAUDE.md"), older, older);
      utimesSync(join(repo, ".ai", "guide.md"), newer, newer);

      const result = runHook(repo, "codex");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Generated AI docs may be stale");
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
