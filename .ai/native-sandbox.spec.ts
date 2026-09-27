import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cleanup: vi.fn(async () => "passed") }));
vi.mock("./process-cleanup.util", () => ({ stopProcessTree: mocks.cleanup }));
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
          : request.id === 4
            ? {
                config: {
                  default_permissions: "test",
                  windows: { sandbox: "elevated" },
                  permissions: { test: { network: { enabled: false } } }
                }
              }
            : { exitCode, stdout: "proof", stderr: "synthetic failure" };
    child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
  });
  mocks.spawn.mockReturnValue(child);
  return { child, requests };
}

it("checks strong Windows readiness before a command and explicitly selects the same profile", async () => {
  const fake = server("ready");
  const onConfiguration = vi.fn();
  expect(
    await runNativeProbe({
      config: [],
      workspace: "C:/repo",
      profileName: "test",
      onConfiguration,
      command: ["node", "probe"]
    })
  ).toBe("proof");
  expect(onConfiguration).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultPermissions: "test",
      windowsSandbox: "elevated",
      selectedProfile: { filesystem: null, network: { enabled: false } }
    })
  );
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
  expect(mocks.cleanup).toHaveBeenCalledWith(fake.child);
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
  expect(mocks.cleanup).toHaveBeenCalledWith(fake.child);
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

it("rejects an otherwise successful preflight when cleanup fails", async () => {
  server("ready");
  mocks.cleanup.mockResolvedValueOnce("failed");
  await expect(
    runNativeProbe({
      config: [],
      workspace: "C:/repo",
      profileName: "test",
      command: ["node", "probe"]
    })
  ).rejects.toThrow("cleanup failed");
});
