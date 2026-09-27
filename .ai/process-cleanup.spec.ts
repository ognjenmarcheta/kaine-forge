import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: mocks.spawn
}));
import { stopProcessTree } from "./process-cleanup.util";

const platform = process.platform;
afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture() {
  Object.defineProperty(process, "platform", { value: "win32" });
  const child = Object.assign(new ChildProcess(), { pid: 12345 });
  vi.spyOn(child, "kill").mockReturnValue(true);
  const killer = Object.assign(new EventEmitter(), { kill: vi.fn() });
  mocks.spawn.mockReturnValue(killer);
  return { child, killer };
}

it("requires successful tree termination and confirmed process exit", async () => {
  const { child, killer } = fixture();
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error(), { code: "ESRCH" });
  });
  const result = stopProcessTree(child);
  killer.emit("close", 0);
  expect(await result).toBe("passed");
  expect(mocks.spawn).toHaveBeenLastCalledWith(
    "taskkill",
    ["/PID", "12345", "/T", "/F"],
    expect.objectContaining({ windowsHide: true })
  );
});

it.each(["error", "nonzero", "timeout", "still-alive"])(
  "fails closed on %s cleanup",
  async (failure) => {
    vi.useFakeTimers();
    const { child, killer } = fixture();
    vi.spyOn(process, "kill").mockReturnValue(true);
    const result = stopProcessTree(child);
    if (failure === "error") killer.emit("error", new Error("private diagnostic"));
    if (failure === "nonzero") killer.emit("close", 1);
    if (failure === "still-alive") killer.emit("close", 0);
    await vi.advanceTimersByTimeAsync(4100);
    expect(await result).toBe("failed");
  }
);

it("does not certify a process that never started", async () => {
  expect(await stopProcessTree(new ChildProcess())).toBe("not-started");
});

it("reports synchronous termination-launch errors without leaking diagnostics", async () => {
  const { child } = fixture();
  mocks.spawn.mockImplementationOnce(() => {
    throw new Error("private launch failure");
  });
  expect(await stopProcessTree(child)).toBe("failed");
});
