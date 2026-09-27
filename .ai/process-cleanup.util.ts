import { spawn, type ChildProcess } from "node:child_process";

export type CleanupStatus = "passed" | "failed" | "not-started";

function fallbackKill(child: ChildProcess) {
  try {
    child.kill("SIGKILL");
  } catch {
    /* The caller still reports failed cleanup. */
  }
}

/** A termination attempt is not evidence that the process tree stopped. */
export async function stopProcessTree(child: ChildProcess): Promise<CleanupStatus> {
  try {
    return await terminateTree(child);
  } catch {
    fallbackKill(child);
    return "failed";
  }
}

async function terminateTree(child: ChildProcess): Promise<CleanupStatus> {
  const pid = child.pid;
  if (!pid) return "not-started";
  // A successful one-shot command can close before cleanup begins. Verify its exit
  // and drained pipes; a running Windows server still requires taskkill /T below.
  if (
    process.platform === "win32" &&
    (child.exitCode !== null || child.signalCode !== null) &&
    child.stdout?.readableEnded &&
    child.stderr?.readableEnded
  ) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      return error instanceof Error && "code" in error && error.code === "ESRCH"
        ? "passed"
        : "failed";
    }
    return "failed";
  }
  if (process.platform === "win32") {
    const killed = await new Promise<boolean>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      const timer = setTimeout(() => {
        fallbackKill(killer);
        fallbackKill(child);
        resolve(false);
      }, 2000);
      killer.once("error", () => {
        clearTimeout(timer);
        fallbackKill(child);
        resolve(false);
      });
      killer.once("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    });
    if (!killed) return "failed";
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
        fallbackKill(child);
        return "failed";
      }
    }
  }
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      process.kill(process.platform === "win32" ? pid : -pid, 0);
    } catch (error) {
      return error instanceof Error && "code" in error && error.code === "ESRCH"
        ? "passed"
        : "failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return "failed";
}
