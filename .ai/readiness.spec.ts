import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { discoverSkills, renderCodexSkill, renderOpencodeConfig, REPO_ROOT } from "./ai.util";
import { managedConfigMatches, mergeInstalledConfig } from "./install-config.util";
import { readInstallSelection, writeInstallSelection } from "./install-state.util";
import { computeSkillDrift } from "./installation.util";
import { probeMcp, validateMcpPins } from "./mcp-probe.util";
import { installedServers } from "./readiness";

it("respects selected skills and detects content drift independently of timestamps", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-readiness-"));
  try {
    const skills = discoverSkills();
    const skill = skills.find((entry) => entry.name === "kaine-test");
    if (!skill) throw new Error("Missing test skill");
    const directory = path.join(root, ".agents/skills/kaine-test");
    mkdirSync(directory, { recursive: true });
    writeInstallSelection("codex", { schemaVersion: 1, skills: [skill.name], mcps: [] }, root);
    writeFileSync(path.join(directory, "SKILL.md"), renderCodexSkill(skill));
    expect(computeSkillDrift(skills, root)).toEqual([]);
    expect(
      computeSkillDrift(
        skills.map((entry) =>
          entry.name === skill.name ? { ...entry, body: `${entry.body}\nChanged` } : entry
        ),
        root
      )[0]?.stale
    ).toEqual([skill.name]);
    writeFileSync(path.join(root, ".ai.local/installations/codex.json"), '{"skills": "bad"}');
    expect(() => readInstallSelection("codex", root)).toThrow("Invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("preserves personal settings, hooks and unmanaged MCPs during regeneration", () => {
  const old = JSON.stringify({
    theme: "dark",
    hooks: {
      SessionStart: [
        { hooks: [{ command: "personal" }] },
        { hooks: [{ command: "node .ai/hooks/old.mjs" }] }
      ]
    },
    mcpServers: { old: {}, personal: { command: "local" } }
  });
  const next = JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ command: "node .ai/hooks/session-start.mjs" }] }] },
    mcpServers: { current: { command: "pinned" } }
  });
  expect(JSON.parse(mergeInstalledConfig(old, next, false, ["old", "current"]))).toEqual({
    theme: "dark",
    hooks: {
      SessionStart: [
        { hooks: [{ command: "personal" }] },
        { hooks: [{ command: "node .ai/hooks/old.mjs" }] },
        { hooks: [{ command: "node .ai/hooks/session-start.mjs" }] }
      ]
    },
    mcpServers: { personal: { command: "local" }, current: { command: "pinned" } }
  });
});

it("rejects malformed installed configuration and ignores disabled servers", () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-config-"));
  try {
    writeFileSync(
      path.join(root, ".mcp.json"),
      '{"mcpServers":{"disabled":{"disabled":true},"active":{"command":"node"}}}'
    );
    expect(Object.keys(installedServers("claude", root))).toEqual(["active"]);
    writeFileSync(path.join(root, ".mcp.json"), '{"mcpServers": []}');
    expect(() => installedServers("claude", root)).toThrow("Invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("requires exact repository npm and Git pins", () => {
  expect(
    validateMcpPins(JSON.parse(readFileSync(path.join(REPO_ROOT, ".ai/mcp.json"), "utf8")))
  ).toEqual([]);
  expect(
    validateMcpPins({
      mcpServers: {
        npm: { command: "npx", args: ["-y", "tool@latest"] },
        git: { command: "uvx", args: ["git+https://example.test/tool"] }
      }
    })
  ).toHaveLength(2);
});

it("initializes a synthetic MCP without tool calls and terminates its process", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "kaine-mcp-"));
  try {
    const pidFile = path.join(root, "pid");
    const server = `require('node:fs').writeFileSync(process.argv[1], String(process.pid)); require('node:readline').createInterface({input:process.stdin}).on('line', line => { const m=JSON.parse(line); if(m.method==='initialize') console.log(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26',capabilities:{},serverInfo:{name:'fixture',version:'1'}}})); else if(m.method!=='notifications/initialized') process.exit(9); }); setInterval(()=>{},1000);`;
    expect(
      await probeMcp({ command: process.execPath, args: ["-e", server, pidFile] }, 2000)
    ).toMatchObject({ status: "passed" });
    const pid = Number(readFileSync(pidFile, "utf8"));
    await expect
      .poll(() => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      })
      .toBe(true);
    expect(
      await probeMcp({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }, 100)
    ).toMatchObject({ status: "failed", reason: "Initialization timed out" });
    expect(
      await probeMcp(
        {
          command: process.execPath,
          args: ["-e", "console.log('private-secret');setInterval(()=>{},1000)"]
        },
        1000
      )
    ).toEqual({ status: "failed", reason: "Invalid protocol output", cleanup: "passed" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("removes unselected managed TOML servers and preserves launch options", () => {
  const previous =
    '[mcp_servers.old]\ncommand="npx"\n[mcp_servers.current]\ncommand="old"\nenabled=false\nstartup_timeout_sec=30\n';
  const generated = '[mcp_servers.current]\ncommand="pinned"\n';
  const result = mergeInstalledConfig(previous, generated, true, ["old", "current"]);
  expect(result).not.toContain("mcp_servers.old");
  expect(result).toContain("enabled = false");
  expect(result).toContain("startup_timeout_sec = 30");
  expect(mergeInstalledConfig(previous, "", true, ["old", "current"])).not.toContain("command =");
});

it.each([false, true])(
  "preserves OpenCode enabled=%s while updating launch definitions",
  (enabled) => {
    const generated = renderOpencodeConfig({
      mcpServers: {
        current: { command: "npx", args: ["tool@1.2.3"] },
        added: { command: "node", args: ["server.mjs"] }
      }
    });
    const previous = JSON.stringify({
      mcp: { current: { type: "local", command: ["npx", "tool@1.0.0"], enabled } }
    });
    const installed = mergeInstalledConfig(previous, generated, false, ["current", "added"]);
    expect(JSON.parse(installed)).toMatchObject({
      mcp: {
        current: { command: ["npx", "tool@1.2.3"], enabled },
        added: { command: ["node", "server.mjs"], enabled: true }
      }
    });
    expect(managedConfigMatches(installed, generated)).toBe(true);
    expect(managedConfigMatches(installed.replace("tool@1.2.3", "tool@1.0.0"), generated)).toBe(
      false
    );
  }
);

it("accepts personal settings while detecting modified managed hooks", () => {
  const expected = JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ command: "node .ai/hooks/session-start.mjs" }] }] }
  });
  const installed = mergeInstalledConfig(
    '{"theme":"dark","hooks":{"SessionStart":[{"hooks":[{"command":"personal"}]}]}}',
    expected,
    false,
    []
  );
  expect(managedConfigMatches(installed, expected)).toBe(true);
  expect(managedConfigMatches(installed.replace("session-start.mjs", "wrong.mjs"), expected)).toBe(
    false
  );
});
