import { expect, it } from "vitest";

import { runModelProcess } from "./model-process.util";
import { createFixturePidReader } from "./process-fixture.util";

it.each([0, 7])("drains real output and verifies cleanup after exit %s", async (code) => {
  const output: string[] = [];
  const result = await runModelProcess({
    command: process.execPath,
    args: [
      "-e",
      `process.stdin.resume(); process.stdin.on('end',()=>{console.log('complete'); process.exitCode=${code}})`
    ],
    env: {},
    prompt: "synthetic",
    timeoutMs: 3000,
    stdout: (chunk) => output.push(chunk.toString()),
    stderr: () => {}
  });
  expect(result).toMatchObject({
    termination: code === 0 ? "completed" : "failed",
    exitCode: code,
    cleanup: "passed"
  });
  expect(output.join("")).toContain("complete");
});

it("terminates a real model stand-in and its child on timeout", async () => {
  let descendant = 0;
  const readPid = createFixturePidReader();
  try {
    const result = await runModelProcess({
      command: process.execPath,
      args: [
        "-e",
        `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true}); console.log(child.pid); setInterval(()=>{},1000);`
      ],
      env: {},
      prompt: "",
      timeoutMs: 1000,
      stdout: (chunk) => {
        descendant = readPid(chunk) ?? 0;
      },
      stderr: () => {}
    });
    expect(result).toMatchObject({ termination: "timeout", cleanup: "passed" });
    expect(descendant).toBeGreaterThan(0);
    expect(() => process.kill(descendant, 0)).toThrow();
  } finally {
    if (descendant) {
      try {
        process.kill(descendant, "SIGKILL");
      } catch {
        /* Already stopped. */
      }
    }
  }
}, 8000);
