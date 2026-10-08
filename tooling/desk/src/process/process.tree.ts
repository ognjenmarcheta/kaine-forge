import { spawn, type ChildProcess } from "node:child_process";

export type CleanupStatus = "passed" | "failed" | "not-started";

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const fallbackKill = (child: ChildProcess): void => {
  try {
    child.kill("SIGKILL");
  } catch {
    // The caller still reports failed cleanup.
  }
};

const taskkill = (pid: number, fallback: () => void): Promise<boolean> =>
  new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    const timer = setTimeout(() => {
      fallbackKill(killer);
      fallback();
      resolve(false);
    }, 2000);
    killer.once("error", () => {
      clearTimeout(timer);
      fallback();
      resolve(false);
    });
    killer.once("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });

const terminate = async (pid: number, fallback: () => void): Promise<CleanupStatus> => {
  const windows = process.platform === "win32";
  if (windows) {
    if (!(await taskkill(pid, fallback))) return "failed";
  } else {
    // The child leads its own process group (spawned `detached`), so `-pid` reaches the tree.
    try {
      process.kill(-pid, "SIGKILL");
    } catch (error) {
      if (!isErrno(error, "ESRCH")) {
        fallback();
        return "failed";
      }
    }
  }
  // A kill attempt is not proof. Poll until the process group is gone.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try {
      process.kill(windows ? pid : -pid, 0);
    } catch (error) {
      if (isErrno(error, "ESRCH")) return "passed";
      // macOS answers EPERM for a killed process that nobody has reaped yet. Keep polling.
      if (!isErrno(error, "EPERM")) return "failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return "failed";
};

/**
 * Stop a child and everything it started. Returns `passed` only after the
 * process group is verified gone. Spawn the child with `detached: true` on POSIX.
 */
export const stopProcessTree = async (child: ChildProcess): Promise<CleanupStatus> => {
  const pid = child.pid;
  if (!pid) return "not-started";
  try {
    return await terminate(pid, () => fallbackKill(child));
  } catch {
    fallbackKill(child);
    return "failed";
  }
};

/**
 * Stop the process group that a recorded pid leads. Recovery uses it for an
 * agent that outlived a crashed desk, when no `ChildProcess` handle exists.
 * The caller must have checked that the pid is still the recorded process.
 */
export const stopProcessGroup = async (pid: number): Promise<CleanupStatus> => {
  try {
    return await terminate(pid, () => undefined);
  } catch {
    return "failed";
  }
};
