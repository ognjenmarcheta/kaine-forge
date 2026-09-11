#!/usr/bin/env node

// Blocks the destructive commands listed in .ai/permissions.json before an
// agent runs them. Registered as PreToolUse on Claude, Codex and Grok; the
// OpenCode plugin and Cursor hook reuse the same matcher.
//
// Fails open. An unreadable or invalid policy warns on stderr and exits 0,
// because a broken policy file must not brick every shell call an agent makes.
// pnpm ai:doctor validates the file so that failure mode stays visible.

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { guardedCommandMessage, matchGuardedCommand } from "./guarded-command.mjs";

const args = process.argv.slice(2);
const agentIndex = args.indexOf("--agent");
const agent = agentIndex >= 0 ? args[agentIndex + 1] : "claude";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const readStdinJson = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) {
    return {};
  }
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
};

const readRules = () => {
  const source = JSON.parse(readFileSync(join(repoRoot, ".ai", "permissions.json"), "utf8"));
  if (!Array.isArray(source.rules)) {
    throw new Error("permissions.json: rules must be an array");
  }
  return source.rules;
};

// Claude, Codex and Grok all treat exit 2 as a hard stop and feed stderr back
// to the model, so the exit code carries a deny even if a dialect drifts. The
// JSON only improves the message.
const denyPayload = (message) => {
  if (agent === "codex") {
    return { decision: "block", reason: message };
  }
  if (agent === "grok") {
    return { decision: "deny", reason: message };
  }
  // Cursor's beforeShellExecution verdict is a boolean allow, and it honours no
  // exit-code fallback, so this shape is the only thing that blocks there.
  if (agent === "cursor") {
    return { allow: false, reason: message };
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message
    }
  };
};

// PreToolUse sends { tool_name, tool_input: { command } }; Cursor's
// beforeShellExecution is its own event and carries the command at the top
// level. Accept either rather than assuming one shape at a trust boundary.
const proposedCommand = (input) => {
  if (typeof input.command === "string") {
    return input.command;
  }
  if (input.tool_name === "Bash" && typeof input.tool_input?.command === "string") {
    return input.tool_input.command;
  }
  return null;
};

const main = async () => {
  const input = await readStdinJson();
  const command = proposedCommand(input);
  if (command === null) {
    return;
  }

  const rule = matchGuardedCommand(command, readRules());
  if (!rule) {
    return;
  }

  const message = guardedCommandMessage(rule);

  if (rule.decision === "deny") {
    process.stdout.write(`${JSON.stringify(denyPayload(message))}\n`);
    process.stderr.write(`Blocked by .ai/permissions.json (${rule.id}): ${message}\n`);
    process.exitCode = 2;
    return;
  }

  // Only Claude has a three-state verdict. Everywhere else this degrades to an
  // advisory rather than a block, deliberately: `git push --force` is on the ask
  // list and kaine-rebase needs it.
  if (agent === "claude") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: message
        }
      })}\n`
    );
    return;
  }

  process.stderr.write(`Caution, from .ai/permissions.json (${rule.id}): ${message}\n`);
};

main().catch((error) => {
  process.stderr.write(`pre-tool-use hook skipped: ${error.message}\n`);
  process.exitCode = 0;
});
