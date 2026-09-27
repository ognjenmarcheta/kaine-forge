import { spawn } from "node:child_process";
import { expect, it } from "vitest";

import { stopProcessTree } from "./process-cleanup.util";

it("verifies normal one-shot shutdown after output pipes drain", async () => {
  const child = spawn(process.execPath, ["-e", "console.log('completed')"], {
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.resume();
  child.stderr.resume();
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  expect(await stopProcessTree(child)).toBe("passed");
});

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
      const timer = setTimeout(() => reject(new Error("Synthetic server did not start")), 3000);
      child.once("error", reject);
      child.stdout.once("data", (chunk: Buffer) => {
        clearTimeout(timer);
        resolve(Number(chunk.toString().trim()));
      });
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
