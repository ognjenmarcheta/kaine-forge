#!/usr/bin/env node

// PostToolUse hook for Agent Desk runs. Appends one JSON line for each tool
// call that actually ran: { tool, command | file | skill, ts }. A call that a
// permission rule or another hook blocked never reaches PostToolUse, so the
// receipts are an independent record of what executed.
//
// Usage: node receipt.mjs <receipts-path>   (or set KAINE_DESK_RECEIPTS)
//
// It never blocks the agent. Any failure warns on stderr and exits 0.

import { Buffer } from "node:buffer";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const MAX_COMMAND_LENGTH = 2000;

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

const text = (value) => (typeof value === "string" && value !== "" ? value : undefined);

const receiptFor = (input, now = new Date()) => {
  const tool = text(input.tool_name);
  if (tool === undefined) {
    return null;
  }
  const toolInput =
    input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  const command = text(toolInput.command);
  const file = text(toolInput.file_path) ?? text(toolInput.path) ?? text(toolInput.relative_path);
  const skill = tool === "Skill" ? text(toolInput.skill) : undefined;
  return {
    tool,
    ...(command === undefined ? {} : { command: command.slice(0, MAX_COMMAND_LENGTH) }),
    ...(file === undefined ? {} : { file }),
    ...(skill === undefined ? {} : { skill }),
    ts: now.toISOString()
  };
};

const main = async () => {
  const target = process.argv[2] ?? process.env.KAINE_DESK_RECEIPTS;
  if (!target) {
    process.stderr.write("receipt hook skipped: no receipts path\n");
    return;
  }
  const receipt = receiptFor(await readStdinJson());
  if (receipt === null) {
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(receipt)}\n`);
};

main().catch((error) => {
  process.stderr.write(`receipt hook skipped: ${error.message}\n`);
  process.exitCode = 0;
});
