import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { createLabServers, type LabServers } from "./jobs.devserver";

/** A stand-in for Vite: answers the frame page on the port it gets. */
const tinyServer = (_worktree: string, port: number) =>
  spawn(
    process.execPath,
    [
      "-e",
      `require("node:http").createServer((q, r) => { r.statusCode = q.url === "/lab-frame.html" ? 200 : 404; r.end("ok"); }).listen(${port}, "127.0.0.1")`
    ],
    { stdio: "ignore", detached: process.platform !== "win32" }
  );

let servers: LabServers | null = null;
afterEach(async () => {
  await servers?.stopAll();
  servers = null;
});

describe("createLabServers", () => {
  it("starts one server per job on a free port, shares it, and stops it", async () => {
    servers = createLabServers({ start: tinyServer, readyTimeoutMs: 10_000 });

    const [first, second] = await Promise.all([servers.ensure(1, "/wt"), servers.ensure(1, "/wt")]);

    expect(second).toBe(first);
    expect(first.labUrl).toBe(`http://localhost:${first.port}/lab-frame.html`);
    expect((await fetch(`http://127.0.0.1:${first.port}/lab-frame.html`)).status).toBe(200);

    await servers.stop(1);
    expect(servers.get(1)).toBeNull();
    await expect(fetch(`http://127.0.0.1:${first.port}/lab-frame.html`)).rejects.toThrow();
  });

  it("fails and leaves nothing running when the server never answers", async () => {
    servers = createLabServers({
      start: () =>
        spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
          stdio: "ignore",
          detached: process.platform !== "win32"
        }),
      readyTimeoutMs: 1500
    });
    await expect(servers.ensure(2, "/wt")).rejects.toThrow(/did not answer/);
    expect(servers.get(2)).toBeNull();
  });
});
