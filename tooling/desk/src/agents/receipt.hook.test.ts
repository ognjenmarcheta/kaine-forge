import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseReceipts } from "./permissions";

const HOOK = fileURLToPath(new URL("../../hooks/receipt.mjs", import.meta.url));

interface HookRun {
  readonly code: number | null;
  readonly stderr: string;
}

const runHook = (
  args: readonly string[],
  stdin: string,
  env: Record<string, string> = {}
): Promise<HookRun> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK, ...args], {
      env: { PATH: process.env.PATH ?? "", ...env },
      stdio: ["pipe", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf8");
    });
    child.once("close", (code) => resolve({ code, stderr }));
    child.stdin.end(stdin);
  });

const dirs: string[] = [];
const tempFile = async (...segments: string[]): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), "desk-receipt-"));
  dirs.push(dir);
  return path.join(dir, ...segments);
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const call = (toolName: string, toolInput: Record<string, string>) =>
  JSON.stringify({ hook_event_name: "PostToolUse", tool_name: toolName, tool_input: toolInput });

describe("receipt hook", () => {
  it("appends one receipt per call with the command, file or skill", async () => {
    const target = await tempFile("receipts.jsonl");
    await runHook([target], call("Bash", { command: "pnpm --filter @repo/desk test" }));
    await runHook([target], call("Read", { file_path: "/w/src/a.ts" }));
    await runHook([target], call("Skill", { skill: "kaine-test" }));
    await runHook([target], call("Glob", { pattern: "**/*.ts" }));
    const receipts = parseReceipts(await readFile(target, "utf8"));
    expect(receipts).toEqual([
      expect.objectContaining({ tool: "Bash", command: "pnpm --filter @repo/desk test" }),
      expect.objectContaining({ tool: "Read", file: "/w/src/a.ts" }),
      expect.objectContaining({ tool: "Skill", skill: "kaine-test" }),
      expect.objectContaining({ tool: "Glob" })
    ]);
    expect(receipts[3]).not.toHaveProperty("command");
    for (const receipt of receipts) expect(Number.isNaN(Date.parse(receipt.ts))).toBe(false);
  });

  it("creates the receipts directory", async () => {
    const target = await tempFile("nested", "deeper", "receipts.jsonl");
    const result = await runHook([target], call("Bash", { command: "echo hi" }));
    expect(result.code).toBe(0);
    expect(existsSync(target)).toBe(true);
  });

  it("falls back to KAINE_DESK_RECEIPTS when no path argument is given", async () => {
    const target = await tempFile("env.jsonl");
    await runHook([], call("Bash", { command: "echo env" }), { KAINE_DESK_RECEIPTS: target });
    expect(parseReceipts(await readFile(target, "utf8"))).toHaveLength(1);
  });

  it("truncates a very long command", async () => {
    const target = await tempFile("long.jsonl");
    await runHook([target], call("Bash", { command: "x".repeat(5000) }));
    const [receipt] = parseReceipts(await readFile(target, "utf8"));
    expect(receipt?.command).toHaveLength(2000);
  });

  it.each([
    ["no receipts path", [], call("Bash", { command: "x" })],
    ["empty stdin", ["__TARGET__"], ""],
    ["invalid JSON", ["__TARGET__"], "{ nope"],
    ["input without a tool name", ["__TARGET__"], JSON.stringify({ tool_input: { command: "x" } })]
  ])("never blocks the agent and writes nothing: %s", async (_name, args, stdin) => {
    const target = await tempFile("none.jsonl");
    const result = await runHook(
      args.map((arg) => (arg === "__TARGET__" ? target : arg)),
      stdin
    );
    expect(result.code).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it("exits 0 and warns when the receipts file cannot be written", async () => {
    const result = await runHook(
      ["/dev/null/impossible/receipts.jsonl"],
      call("Bash", { command: "x" })
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("receipt hook skipped");
  });
});
