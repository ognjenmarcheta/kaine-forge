import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { runNativeProbe } from "./native-sandbox";

function server(status: "ready" | "notConfigured", exitCode = 0) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  });
  const requests: Array<{
    id?: number | undefined;
    method: string;
    params?: z.infer<ReturnType<typeof z.json>> | undefined;
  }> = [];
  child.stdin.on("data", (chunk: Buffer) => {
    const request = z
      .object({ id: z.number().optional(), method: z.string(), params: z.json().optional() })
      .parse(JSON.parse(chunk.toString()));
    requests.push(request);
    if (!request.id) return;
    const result =
      request.id === 1
        ? {}
        : request.id === 2
          ? { status }
          : { exitCode, stdout: "proof", stderr: "synthetic failure" };
    child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
  });
  mocks.spawn.mockReturnValue(child);
  return { child, requests };
}

it("checks strong Windows readiness before a command and explicitly selects the same profile", async () => {
  const fake = server("ready");
  expect(
    await runNativeProbe({
      config: [],
      workspace: "C:/repo",
      profileName: "test",
      command: ["node", "probe"]
    })
  ).toBe("proof");
  expect(fake.requests.at(-1)).toEqual({
    id: 3,
    method: "command/exec",
    params: {
      command: ["node", "probe"],
      cwd: "C:/repo",
      permissionProfile: "test",
      timeoutMs: 30000
    }
  });
  expect(fake.child.kill).toHaveBeenCalledTimes(1);
});

it("does not execute a command when administrator setup is missing", async () => {
  const fake = server("notConfigured");
  await expect(
    runNativeProbe({
      config: [],
      workspace: "C:/repo",
      profileName: "test",
      command: ["node", "probe"]
    })
  ).rejects.toThrow("administrator-assisted");
  expect(fake.requests.some((request) => request.method === "command/exec")).toBe(false);
  expect(fake.child.kill).toHaveBeenCalledTimes(1);
});

it("fails when the native command fails even after successful readiness", async () => {
  server("ready", 1);
  await expect(
    runNativeProbe({
      config: [],
      workspace: "C:/repo",
      profileName: "test",
      command: ["node", "probe"]
    })
  ).rejects.toThrow("Native probe command failed");
});
