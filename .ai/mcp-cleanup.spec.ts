import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cleanup: vi.fn(async () => "failed") }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: mocks.spawn
}));
vi.mock("./process-cleanup.util", () => ({ stopProcessTree: mocks.cleanup }));
import { probeMcp } from "./mcp-probe.util";

it.each([true, false])(
  "does not certify initialization when cleanup fails (initialized=%s)",
  async (valid) => {
    const child = Object.assign(new ChildProcess(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough()
    });
    mocks.spawn.mockReturnValue(child);
    const pending = probeMcp({ command: "synthetic" });
    child.stdout.write(
      valid
        ? JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              serverInfo: { name: "synthetic", version: "1" }
            }
          }) + "\n"
        : "private invalid protocol\n"
    );
    expect(await pending).toEqual({
      status: "failed",
      cleanup: "failed",
      reason: `${valid ? "Initialization succeeded; tools were not invoked" : "Invalid protocol output"}; process cleanup failed`
    });
  }
);
