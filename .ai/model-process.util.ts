import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { stopProcessTree, type CleanupStatus } from "./process-cleanup.util";

type ProcessResult = {
  termination: "completed" | "failed" | "timeout" | "cancelled";
  exitCode: number | null;
  cleanup: CleanupStatus;
  failure?: string;
};

/** Owns the model process, its streams and its bounded shutdown. No model-specific parsing. */
export function runModelProcess(input: {
  command: string;
  args: string[];
  env: Record<string, string>;
  prompt: string;
  timeoutMs: number;
  stdout: (chunk: Buffer) => void;
  stderr: (chunk: Buffer) => void;
}): Promise<ProcessResult> {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(input.command, input.args, {
      env: input.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32"
    });
  } catch {
    return Promise.resolve({
      termination: "failed",
      exitCode: null,
      cleanup: "not-started",
      failure: "Model launch failed"
    });
  }
  const processChild = child;
  return new Promise((resolve) => {
    let stopping = false;
    let settled = false;
    let closed = false;
    let termination: ProcessResult["termination"] = "completed";
    let failure: string | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let drainTimer: ReturnType<typeof setTimeout> | undefined;
    let finishDrain: (() => void) | undefined;
    const onClose = () => {
      closed = true;
      finishDrain?.();
      stop("completed");
    };
    const complete = (cleanup: CleanupStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      clearTimeout(drainTimer);
      finishDrain?.();
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
      processChild.removeListener("exit", onExit);
      processChild.removeListener("close", onClose);
      processChild.stdout.removeListener("data", onStdout);
      processChild.stderr.removeListener("data", onStderr);
      processChild.stdin.destroy();
      processChild.stdout.destroy();
      processChild.stderr.destroy();
      processChild.unref();
      if (cleanup === "failed") failure = `${failure ? `${failure}; ` : ""}process cleanup failed`;
      if (termination === "completed" && (processChild.exitCode !== 0 || cleanup !== "passed"))
        termination = "failed";
      resolve({
        termination,
        exitCode: processChild.exitCode,
        cleanup,
        ...(failure ? { failure } : {})
      });
    };
    const stop = (reason: ProcessResult["termination"], message?: string) => {
      if (settled) return;
      if (message && !failure) failure = message;
      if (termination === "completed") termination = reason;
      if (stopping) return;
      stopping = true;
      clearTimeout(timer);
      deadline = setTimeout(() => complete("failed"), 5000);
      void (async () => {
        // An exit event can precede drained output. Allow at most one second,
        // leaving four seconds for the shared cleanup helper within our deadline.
        if (reason === "completed" && !closed) {
          await new Promise<void>((done) => {
            finishDrain = done;
            drainTimer = setTimeout(done, 1000);
          });
          clearTimeout(drainTimer);
        }
        if (settled) return;
        const cleanup = await stopProcessTree(processChild);
        if (settled) return;
        if (cleanup === "passed" && !closed) {
          await new Promise<void>((done) => {
            finishDrain = done;
          });
        }
        if (!settled) complete(cleanup);
      })().catch(() => complete("failed"));
    };
    const onExit = () => stop("completed");
    const cancel = () => stop("cancelled");
    const onError = () => stop("failed", "Model process failed");
    const onStreamError = () => stop("failed", "Model stream failed");
    const consume = (consumer: (chunk: Buffer) => void, chunk: Buffer) => {
      if (settled) return;
      try {
        consumer(chunk);
      } catch {
        stop("failed", "Model output handling failed");
      }
    };
    const onStdout = (chunk: Buffer) => consume(input.stdout, chunk);
    const onStderr = (chunk: Buffer) => consume(input.stderr, chunk);
    const timer = setTimeout(() => stop("timeout"), input.timeoutMs);
    process.on("SIGINT", cancel);
    process.on("SIGTERM", cancel);
    processChild.on("error", onError);
    processChild.once("exit", onExit);
    processChild.once("close", onClose);
    // Retain error listeners until the destroyed streams are collected: pending
    // errors after finalization must not become uncaught exceptions.
    processChild.stdin.on("error", onStreamError);
    processChild.stdout.on("error", onStreamError);
    processChild.stderr.on("error", onStreamError);
    processChild.stdout.on("data", onStdout);
    processChild.stderr.on("data", onStderr);
    try {
      processChild.stdin.end(input.prompt);
    } catch {
      onStreamError();
    }
  });
}
