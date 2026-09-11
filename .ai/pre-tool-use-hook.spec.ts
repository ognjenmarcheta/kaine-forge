import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readPermissionsSource, type GuardRule } from "./ai.util";
import {
  guardedCommandMessage,
  matchGuardedCommand,
  splitShellSegments
} from "./hooks/guarded-command.mjs";

const hookScript = join(process.cwd(), ".ai", "hooks", "pre-tool-use.mjs");

// Reading through readPermissionsSource rather than parsing the file here means
// the canonical GuardRule type flows into matchGuardedCommand, so the .mjs
// declarations cannot drift from it without failing typecheck.
const rules: GuardRule[] = readPermissionsSource();

const runHook = (command: string, agent = "claude", toolName = "Bash") =>
  spawnSync("node", [hookScript, "--agent", agent], {
    cwd: process.cwd(),
    input: JSON.stringify({
      cwd: process.cwd(),
      hook_event_name: "PreToolUse",
      session_id: "spec",
      tool_input: { command },
      tool_name: toolName
    }),
    encoding: "utf8"
  });

describe("permissions policy", () => {
  it("loses no committed rule to the boundary filter", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(process.cwd(), ".ai", "permissions.json"), "utf8")
    );
    const declared =
      raw !== null && typeof raw === "object" && Array.isArray((raw as { rules?: unknown[] }).rules)
        ? ((raw as { rules: unknown[] }).rules ?? []).length
        : 0;

    // readPermissionsSource drops malformed entries silently, which is right at
    // a trust boundary and wrong if it quietly disarms the committed policy.
    expect(rules).toHaveLength(declared);
  });

  it("gives every rule a unique id, a reason, and a known decision", () => {
    const ids = rules.map((rule) => rule.id);

    expect(rules.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of rules) {
      expect(rule.reason.trim(), rule.id).not.toBe("");
      expect(["deny", "ask"], rule.id).toContain(rule.decision);
      expect(rule.command.trim(), rule.id).not.toBe("");
    }
  });

  it("keeps every irreversible command on the deny tier", () => {
    // ask is only a real verdict on Claude, so anything that cannot be undone
    // has to be a deny or it is unguarded on four of five agents.
    const denied = rules.filter((rule) => rule.decision === "deny").map((rule) => rule.id);

    expect(denied).toEqual(["db-push", "clean-deps", "release-apps", "git-no-verify"]);
  });
});

describe("matchGuardedCommand", () => {
  it("splits on every shell separator", () => {
    expect(splitShellSegments("a && b || c ; d | e\nf")).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(splitShellSegments("run <<EOF\nb\nEOF\nc")).toEqual(["run <<EOF", "c"]);
  });

  it("ignores heredoc bodies, which are data rather than commands", () => {
    // Regression: this policy's own commit message mentions pnpm db:push, and
    // newline splitting blocked the commit that introduced the rule.
    const command = [
      "git commit -F - <<'MSGEOF'",
      "feat(ai): block destructive commands",
      "",
      "the only thing between an agent and",
      "pnpm db:push was an untracked file",
      "MSGEOF"
    ].join("\n");

    expect(matchGuardedCommand(command, rules)).toBeNull();
  });

  it("still blocks a guarded command after a heredoc closes", () => {
    const command = ["cat <<EOF > notes.md", "pnpm db:push is unsafe", "EOF", "pnpm db:push"].join(
      "\n"
    );

    expect(matchGuardedCommand(command, rules)?.id).toBe("db-push");
  });

  it("matches a guarded command anywhere in a chain", () => {
    expect(matchGuardedCommand("pnpm lint && pnpm db:push", rules)?.id).toBe("db-push");
  });

  it("prefers deny over ask when both could match", () => {
    expect(matchGuardedCommand("pnpm db:seed && pnpm db:push", rules)?.decision).toBe("deny");
  });

  it("matches a flag rule only on the exact token", () => {
    expect(matchGuardedCommand("git push --force origin main", rules)?.id).toBe("git-push-force");
    // The guard that a naive includes("--force") would fail.
    expect(matchGuardedCommand("git push --force-with-lease origin main", rules)).toBeNull();
  });

  it("respects the command word boundary", () => {
    expect(matchGuardedCommand("github-cli run --no-verify", rules)).toBeNull();
    expect(matchGuardedCommand("git commit -m x --no-verify", rules)?.id).toBe("git-no-verify");
  });

  it("allows unguarded commands", () => {
    for (const command of ["pnpm test", "pnpm check", "git status", "git push origin main"]) {
      expect(matchGuardedCommand(command, rules), command).toBeNull();
    }
  });

  it("names the redirect when the rule carries one", () => {
    const rule = matchGuardedCommand("pnpm db:push", rules);

    expect(rule).not.toBeNull();
    expect(guardedCommandMessage(rule as GuardRule)).toContain("pnpm db:generate");
  });
});

describe("pre-tool-use hook", () => {
  it("blocks a denied command with exit 2 and a reason on stderr", () => {
    const result = runHook("pnpm db:push");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("db-push");
    expect(result.stderr).toContain("pnpm db:generate");
  });

  it("emits the Claude verdict shape", () => {
    const output: unknown = JSON.parse(runHook("pnpm db:push", "claude").stdout);

    expect(output).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" }
    });
  });

  it("emits the Codex verdict shape", () => {
    const output: unknown = JSON.parse(runHook("pnpm db:push", "codex").stdout);

    expect(output).toMatchObject({ decision: "block" });
  });

  it("emits the Grok verdict shape", () => {
    const output: unknown = JSON.parse(runHook("pnpm db:push", "grok").stdout);

    expect(output).toMatchObject({ decision: "deny" });
  });

  it("asks on Claude and only advises elsewhere", () => {
    const claude = runHook("git push --force origin main", "claude");
    const codex = runHook("git push --force origin main", "codex");

    expect(claude.status).toBe(0);
    expect(JSON.parse(claude.stdout)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "ask" }
    });

    expect(codex.status).toBe(0);
    expect(codex.stdout).toBe("");
    expect(codex.stderr).toContain("Caution");
  });

  it("stays silent for an unguarded command", () => {
    const result = runHook("pnpm test");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("stays silent for a non-Bash tool", () => {
    const result = runHook("pnpm db:push", "claude", "Read");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("stays silent on empty stdin", () => {
    const result = spawnSync("node", [hookScript], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
