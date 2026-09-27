import { spawn } from "node:child_process";
import { expect, it } from "vitest";

import { stopProcessTree } from "./process-cleanup.util";
import { createFixturePidReader } from "./process-fixture.util";

it.each([0, 7])(
  "verifies one-shot shutdown with exit %s after output pipes drain",
  async (code) => {
    const child = spawn(
      process.execPath,
      ["-e", `console.log('completed'); process.exitCode=${code}`],
      {
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    child.stdout.resume();
    child.stderr.resume();
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", () => resolve());
    });
    expect(await stopProcessTree(child)).toBe("passed");
  }
);

it("terminates a synthetic server and its child", async () => {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    console.log(child.pid);
    setInterval(()=>{},1000);
  `
    ],
    {
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    }
  );
  let descendant = 0;
  try {
    descendant = await new Promise<number>((resolve, reject) => {
      const readPid = createFixturePidReader();
      const dispose = () => {
        clearTimeout(timer);
        child.removeListener("error", onError);
        child.stdout.removeListener("data", onData);
      };
      const onError = (error: Error) => {
        dispose();
        reject(error);
      };
      const onData = (chunk: Buffer) => {
        try {
          const pid = readPid(chunk);
          if (pid === undefined) return;
          dispose();
          resolve(pid);
        } catch {
          onError(new Error("Synthetic process emitted an invalid PID"));
        }
      };
      const timer = setTimeout(() => onError(new Error("Synthetic server did not start")), 3000);
      child.once("error", onError);
      child.stdout.on("data", onData);
    });
    expect(descendant).toBeGreaterThan(0);
    expect(await stopProcessTree(child)).toBe("passed");
    expect(() => process.kill(descendant, 0)).toThrow();
  } finally {
    await stopProcessTree(child);
    if (descendant) {
      try {
        process.kill(descendant, "SIGKILL");
      } catch {
        /* Already stopped. */
      }
    }
  }
}, 10000);
