import { describe, expect, it } from "vitest";

import { createExec } from "./ports";

const node = (script: string): string[] => [process.execPath, "-e", script];

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("createExec", () => {
  const exec = createExec({ parentEnv: { PATH: process.env.PATH ?? "", KEEP_OUT: "secret" } });

  it("returns stdout, stderr and the exit code", async () => {
    const result = await exec({
      argv: node("process.stdout.write('out'); process.stderr.write('err'); process.exit(3)")
    });
    expect(result).toMatchObject({ code: 3, stdout: "out", stderr: "err", timedOut: false });
  });

  it("writes input to stdin", async () => {
    const result = await exec({
      argv: node("process.stdin.pipe(process.stdout)"),
      input: "hello"
    });
    expect(result.stdout).toBe("hello");
  });

  it("passes only allowlisted parent variables plus the request env", async () => {
    const result = await exec({
      argv: node("process.stdout.write(JSON.stringify([process.env.KEEP_OUT, process.env.ADDED]))"),
      env: { ADDED: "yes" }
    });
    expect(JSON.parse(result.stdout)).toEqual([null, "yes"]);
  });

  it("caps captured output and reports truncation", async () => {
    const small = createExec({ maxOutputBytes: 10 });
    const result = await small({ argv: node("process.stdout.write('x'.repeat(5000))") });
    expect(result.stdout).toHaveLength(10);
    expect(result.truncated).toBe(true);
    expect(result.code).toBe(0);
  });

  it("stops the whole process tree on timeout", async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "console.log(child.pid);",
      "setInterval(() => {}, 1000);"
    ].join("");
    const result = await exec({ argv: node(script), timeoutMs: 2500 });
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
    const childPid = Number(result.stdout.trim());
    // Node start-up under load can eat the timeout before the child exists; pid 0 would be our own group.
    expect(childPid).toBeGreaterThan(0);
    // A killed process stays visible until its new parent reaps it.
    const deadline = Date.now() + 3000;
    while (alive(childPid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(alive(childPid)).toBe(false);
  });

  it("reports a missing command as code null without throwing", async () => {
    const result = await exec({ argv: ["definitely-not-a-command-xyz"] });
    expect(result.code).toBeNull();
    expect(result.stderr).toContain("ENOENT");
  });

  it("rejects an empty argv as a failed result", async () => {
    const result = await exec({ argv: [] });
    expect(result.code).toBeNull();
    expect(result.stderr).toBe("empty argv");
  });
});
