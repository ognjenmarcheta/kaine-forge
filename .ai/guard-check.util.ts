import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { renderCursorHooks, renderOpencodeGuardrailPlugin, REPO_ROOT } from "./ai.util";

// These are hook inputs only. No proposed shell command is ever executed.
const commands = [
  "pnpm db:push",
  "git push --force origin main",
  "pnpm test",
  "git push --force-with-lease origin main"
];

export function checkGuardContracts(repoRoot: string = REPO_ROOT): string[] {
  const errors: string[] = [];
  const check = (label: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  check("cursor configuration", () => {
    assert.deepEqual(JSON.parse(renderCursorHooks()), {
      version: 1,
      hooks: {
        beforeShellExecution: [
          { command: "node .ai/hooks/pre-tool-use.mjs --agent cursor", timeout: 10 }
        ]
      }
    });
  });

  for (const agent of ["claude", "codex", "grok", "cursor"]) {
    for (const [index, command] of commands.entries()) {
      check(`${agent} ${command}`, () => {
        const result = spawnSync(
          process.execPath,
          [join(repoRoot, ".ai/hooks/pre-tool-use.mjs"), "--agent", agent],
          {
            input: JSON.stringify(
              agent === "cursor" ? { command } : { tool_name: "Bash", tool_input: { command } }
            ),
            encoding: "utf8",
            timeout: 10_000
          }
        );
        assert.ifError(result.error);
        assert.equal(result.status, index === 0 && agent !== "codex" ? 2 : 0, result.stderr);
        if (index >= 2 || (index === 1 && agent !== "claude" && agent !== "cursor")) {
          assert.equal(result.stdout, "");
          if (index === 1) assert.match(result.stderr, /Caution/);
          return;
        }
        const reason = index === 0 ? /pnpm db:push:local/ : /Destructive on a shared branch/;
        const output: unknown = JSON.parse(result.stdout);
        assert(output !== null && typeof output === "object");
        const permission = index === 0 ? "deny" : "ask";
        if (agent === "cursor") {
          assert("permission" in output && output.permission === permission);
          assert("user_message" in output && typeof output.user_message === "string");
          assert("agent_message" in output && typeof output.agent_message === "string");
          assert.match(output.user_message, reason);
          assert.match(output.agent_message, reason);
        } else if (agent === "grok") {
          assert("decision" in output && output.decision === "deny");
          assert("reason" in output && typeof output.reason === "string");
          assert.match(output.reason, reason);
        } else {
          assert("hookSpecificOutput" in output);
          const hook = output.hookSpecificOutput;
          assert(hook !== null && typeof hook === "object");
          assert("hookEventName" in hook && hook.hookEventName === "PreToolUse");
          assert("permissionDecision" in hook && hook.permissionDecision === permission);
          assert(
            "permissionDecisionReason" in hook && typeof hook.permissionDecisionReason === "string"
          );
          assert.match(hook.permissionDecisionReason, reason);
        }
      });
    }
  }

  check("opencode plugin", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "kaine-guard-check-"));
    try {
      mkdirSync(join(temporaryRoot, ".ai/hooks"), { recursive: true });
      mkdirSync(join(temporaryRoot, ".opencode/plugins"), { recursive: true });
      writeFileSync(join(temporaryRoot, "package.json"), '{"type":"module"}');
      for (const file of ["permissions.json", "hooks/guarded-command.mjs"]) {
        writeFileSync(join(temporaryRoot, ".ai", file), readFileSync(join(repoRoot, ".ai", file)));
      }
      const plugin = join(temporaryRoot, ".opencode/plugins/kaine-guardrail.ts");
      writeFileSync(plugin, renderOpencodeGuardrailPlugin());
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        import assert from "node:assert/strict";
        import { writeFileSync } from "node:fs";
        const { KaineGuardrail } = await import(process.argv[1]);
        const hooks = await KaineGuardrail();
        const before = hooks["tool.execute.before"];
        assert.equal(typeof before, "function");
        const invoke = (command, tool = "bash") => before({ tool }, { args: { command } });
        await assert.rejects(() => invoke("pnpm db:push"), /pnpm db:push:local/);
        for (const command of ["git push --force origin main", "pnpm test", "git push --force-with-lease origin main"]) {
          await invoke(command);
        }
        await invoke("pnpm db:push", "read");
        await invoke(undefined);
        writeFileSync(process.argv[2], "invalid policy");
        await invoke("pnpm db:push");
      `,
          pathToFileURL(plugin).href,
          join(temporaryRoot, ".ai/permissions.json")
        ],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          timeout: 10_000
        }
      );
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /Destructive on a shared branch/);
    } finally {
      assert.equal(dirname(resolve(temporaryRoot)), resolve(tmpdir()));
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
  return errors;
}
