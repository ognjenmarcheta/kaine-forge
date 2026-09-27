import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cleanup: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./process-cleanup.util", () => ({ stopProcessTree: mocks.cleanup }));

import { runModelProcess } from "./model-process.util";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.spawn.mockReset();
  mocks.cleanup.mockReset();
});
afterEach(() => vi.useRealTimers());

function fixture() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null as number | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    unref: vi.fn()
  });
  const close = (code: number | null) => {
    child.exitCode = code;
    child.emit("exit", code);
    child.emit("close", code);
  };
  mocks.spawn.mockReturnValue(child);
  mocks.cleanup.mockImplementation(async () => {
    if (child.exitCode === null) close(null);
    return "passed";
  });
  const stdout = vi.fn();
  const stderr = vi.fn();
  const signals = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const run = () =>
    runModelProcess({
      command: "synthetic",
      args: [],
      env: {},
      prompt: "fixture",
      timeoutMs: 1000,
      stdout,
      stderr
    });
  return { child, close, run, stdout, stderr, signals };
}

it.each([0, 7])("records normal exit %s with verified cleanup", async (code) => {
  const f = fixture();
  const result = f.run();
  f.child.stdout.write("output");
  f.child.stderr.write("diagnostic");
  f.close(code);
  expect(await result).toMatchObject({
    exitCode: code,
    termination: code === 0 ? "completed" : "failed",
    cleanup: "passed"
  });
  expect(f.stdout).toHaveBeenCalled();
  expect(f.stderr).toHaveBeenCalled();
  expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(f.signals);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["timeout", "SIGINT", "SIGTERM"])("cleans up after %s", async (trigger) => {
  const f = fixture();
  const result = f.run();
  if (trigger === "timeout") await vi.advanceTimersByTimeAsync(1000);
  else if (trigger === "SIGINT") process.emit("SIGINT");
  else process.emit("SIGTERM");
  expect(await result).toMatchObject({
    termination: trigger === "timeout" ? "timeout" : "cancelled",
    cleanup: "passed"
  });
  expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("settles once when cancellation, timeout and exit overlap", async () => {
  const f = fixture();
  mocks.cleanup.mockImplementation(
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          f.close(null);
          resolve("passed");
        }, 100);
      })
  );
  const result = f.run();
  process.emit("SIGINT");
  process.emit("SIGINT");
  process.emit("SIGTERM");
  await vi.advanceTimersByTimeAsync(1100);
  expect(await result).toMatchObject({ termination: "cancelled", cleanup: "passed" });
  expect(mocks.cleanup).toHaveBeenCalledTimes(1);
});

it.each(["error", "stdin", "stdout", "stderr", "consumer"])(
  "preserves %s failure alongside cleanup failure without raw diagnostics",
  async (source) => {
    const f = fixture();
    mocks.cleanup.mockResolvedValue("failed");
    const result = f.run();
    if (source === "error") f.child.emit("error", new Error("private"));
    else if (source === "consumer") {
      f.stdout.mockImplementation(() => {
        throw new Error("private");
      });
      f.child.stdout.write("data");
    } else if (source === "stdin") f.child.stdin.emit("error", new Error("private"));
    else if (source === "stdout") f.child.stdout.emit("error", new Error("private"));
    else f.child.stderr.emit("error", new Error("private"));
    const observed = await result;
    expect(observed).toMatchObject({ termination: "failed", cleanup: "failed" });
    expect(observed.failure).toMatch(/Model .*failed; process cleanup failed/);
    expect(JSON.stringify(observed)).not.toContain("private");
  }
);

it("records synchronous startup failure without a cleanup attempt", async () => {
  const f = fixture();
  mocks.spawn.mockImplementation(() => {
    throw new Error("private");
  });
  expect(await f.run()).toMatchObject({ termination: "failed", cleanup: "not-started" });
  expect(mocks.cleanup).not.toHaveBeenCalled();
});

it("records asynchronous startup failure when no process was created", async () => {
  const f = fixture();
  Object.defineProperty(f.child, "pid", { value: undefined });
  mocks.cleanup.mockResolvedValue("not-started");
  const result = f.run();
  f.child.emit("error", new Error("private launch failure"));
  expect(await result).toMatchObject({
    termination: "failed",
    cleanup: "not-started",
    failure: "Model process failed"
  });
});

it("reports a drain failure without discarding verified cleanup after exit", async () => {
  const f = fixture();
  mocks.cleanup.mockResolvedValue("passed");
  const result = f.run();
  f.child.exitCode = 0;
  f.child.emit("exit", 0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatchObject({
    termination: "failed",
    cleanup: "passed",
    failure: "Model output did not close before finalization deadline"
  });
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["pending-cleanup", "missing-close"])("bounds %s to five seconds", async (scenario) => {
  const f = fixture();
  mocks.cleanup.mockImplementation(() =>
    scenario === "pending-cleanup" ? new Promise(() => {}) : Promise.resolve("passed")
  );
  const result = f.run();
  process.emit("SIGINT");
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatchObject({
    termination: "cancelled",
    cleanup: scenario === "missing-close" ? "passed" : "failed",
    failure:
      scenario === "missing-close"
        ? "Model output did not close before finalization deadline"
        : "process cleanup failed"
  });
  expect(f.child.unref).toHaveBeenCalled();
  expect(f.child.stdout.destroyed).toBe(true);
  expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(f.signals);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["timeout", "stream-error"])("preserves %s when draining times out", async (trigger) => {
  const f = fixture();
  mocks.cleanup.mockResolvedValue("passed");
  const result = f.run();
  if (trigger === "timeout") await vi.advanceTimersByTimeAsync(1000);
  else f.child.stdout.emit("error", new Error("private"));
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toMatchObject({
    termination: trigger === "timeout" ? "timeout" : "failed",
    cleanup: "passed",
    failure:
      (trigger === "stream-error" ? "Model stream failed; " : "") +
      "Model output did not close before finalization deadline"
  });
  expect(vi.getTimerCount()).toBe(0);
});

it("accepts close before the finalization deadline after cleanup passes", async () => {
  const f = fixture();
  mocks.cleanup.mockResolvedValue("passed");
  const result = f.run();
  f.child.exitCode = 0;
  f.child.emit("exit", 0);
  await vi.advanceTimersByTimeAsync(4999);
  f.child.stdout.write("final output");
  f.child.emit("close", 0);
  expect(await result).toEqual({ termination: "completed", exitCode: 0, cleanup: "passed" });
  expect(f.stdout).toHaveBeenCalledWith(Buffer.from("final output"));
  expect(vi.getTimerCount()).toBe(0);
});

it("does not report completion when cleanup fails after a zero exit", async () => {
  const f = fixture();
  mocks.cleanup.mockResolvedValue("failed");
  const result = f.run();
  f.close(0);
  expect(await result).toMatchObject({ exitCode: 0, termination: "failed", cleanup: "failed" });
});
