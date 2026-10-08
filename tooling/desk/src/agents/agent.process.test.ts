import { describe, expect, it } from "vitest";

import { agentEnv, createAgentProcess } from "./agent.process";

const node = (script: string) => [process.execPath, "-e", script];
const run = createAgentProcess();

describe("createAgentProcess", () => {
  it("splits stdout into lines, including a final line without a newline", async () => {
    const lines: string[] = [];
    const result = await run({
      argv: node('process.stdout.write("one\\ntwo\\r\\n\\nthree")'),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onLine: (line) => lines.push(line)
    });
    expect(lines).toEqual(["one", "two", "three"]);
    expect(result).toMatchObject({ code: 0, timedOut: false, aborted: false });
  });

  it("reports the child pid once, right after the process starts", async () => {
    const pids: number[] = [];
    const result = await run({
      argv: node('process.stdout.write(String(process.pid) + "\\n")'),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onSpawn: (pid) => pids.push(pid),
      onLine: (line) => pids.push(Number(line))
    });
    expect(result.code).toBe(0);
    // The pid from onSpawn is the pid the child printed.
    expect(pids).toHaveLength(2);
    expect(pids[0]).toBe(pids[1]);
  });

  it("joins a multi-byte character that arrives in two chunks", async () => {
    const lines: string[] = [];
    await run({
      argv: node(
        'const b=Buffer.from("é\\n");process.stdout.write(b.subarray(0,1));setTimeout(()=>process.stdout.write(b.subarray(1)),50)'
      ),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onLine: (line) => lines.push(line)
    });
    expect(lines).toEqual(["é"]);
  });

  it("closes stdin so a child that reads it does not wait", async () => {
    const lines: string[] = [];
    const result = await run({
      argv: node('process.stdin.on("end",()=>console.log("stdin-closed")).resume()'),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onLine: (line) => lines.push(line)
    });
    expect(lines).toEqual(["stdin-closed"]);
    expect(result.code).toBe(0);
  });

  it("keeps a bounded tail of stderr and the exit code", async () => {
    const result = await run({
      // `process.exit` right after a write can cut a pipe write that is still queued (a pipe holds
      // 16 KiB on macOS), so the child sets the exit code and ends by itself.
      argv: node('process.stderr.write("x".repeat(20000)+"END");process.exitCode=3'),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onLine: () => undefined
    });
    expect(result.code).toBe(3);
    expect(result.stderrTail.length).toBeLessThanOrEqual(8 * 1024);
    expect(result.stderrTail.endsWith("END")).toBe(true);
  });

  it("stops the process tree on timeout", async () => {
    const result = await run({
      argv: node("setInterval(()=>{},1000)"),
      cwd: process.cwd(),
      timeoutMs: 200,
      onLine: () => undefined
    });
    expect(result).toMatchObject({ code: null, timedOut: true, aborted: false });
  });

  it("stops the process tree when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = run({
      argv: node("setInterval(()=>{},1000)"),
      cwd: process.cwd(),
      timeoutMs: 30_000,
      signal: controller.signal,
      onLine: () => undefined
    });
    setTimeout(() => controller.abort(), 100);
    expect(await pending).toMatchObject({ code: null, aborted: true, timedOut: false });
  });

  it("does not start when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await run({
      argv: node('console.log("never")'),
      cwd: process.cwd(),
      timeoutMs: 10_000,
      signal: controller.signal,
      onLine: () => {
        throw new Error("the process must not start");
      }
    });
    expect(result.aborted).toBe(true);
  });

  it("reports a program that cannot start", async () => {
    const result = await run({
      argv: ["/definitely/not/a/program"],
      cwd: process.cwd(),
      timeoutMs: 10_000,
      onLine: () => undefined
    });
    expect(result.code).toBeNull();
    expect(result.spawnError).toMatch(/ENOENT/);
  });

  it("passes only allowlisted variables plus the request env", async () => {
    const lines: string[] = [];
    const scoped = createAgentProcess({
      PATH: process.env.PATH ?? "",
      GH_TOKEN: "gh-secret",
      SSH_AUTH_SOCK: "/tmp/agent.sock",
      CODEX_HOME: "/tmp/codex-home",
      LC_ALL: "C"
    });
    await scoped({
      argv: node("console.log(JSON.stringify(process.env))"),
      cwd: process.cwd(),
      env: { KAINE_DESK_RECEIPTS: "/tmp/r.jsonl" },
      timeoutMs: 10_000,
      onLine: (line) => lines.push(line)
    });
    const env = JSON.parse(lines[0] ?? "{}") as Record<string, string>;
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.CODEX_HOME).toBe("/tmp/codex-home");
    expect(env.LC_ALL).toBe("C");
    expect(env.KAINE_DESK_RECEIPTS).toBe("/tmp/r.jsonl");
  });
});

describe("agentEnv", () => {
  it("drops credentials the agent never needs", () => {
    expect(agentEnv({ GITHUB_TOKEN: "x", GH_TOKEN: "y", HOME: "/h" })).toEqual({ HOME: "/h" });
  });
});
