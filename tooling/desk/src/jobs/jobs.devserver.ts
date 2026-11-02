import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import { stopProcessTree } from "../process/process.tree";

/**
 * The lab dev server of a screen job: the job worktree's desk UI on a free local port, so the
 * builder, `lab:diff`, and the owner's compare view all see the screen the job is building. The
 * desk owns it: one per job, stopped when the job ships, is cancelled, or is removed. It does
 * not outlive the desk; a job that waits at its gate after a restart gets a new one on demand.
 */
export interface LabServer {
  readonly port: number;
  /** `http://localhost:<port>/lab-frame.html`: the `LAB_URL` of `lab:diff` and `lab:shots`. */
  readonly labUrl: string;
  readonly stop: () => Promise<void>;
}

export interface LabServers {
  /** The job's server, started if it is not running. Throws when it does not come up. */
  readonly ensure: (jobId: number, worktree: string) => Promise<LabServer>;
  readonly get: (jobId: number) => LabServer | null;
  readonly stop: (jobId: number) => Promise<void>;
  readonly stopAll: () => Promise<void>;
}

const READY_TIMEOUT_MS = 120_000;

/** A port the OS has free now. Vite's `--strictPort` fails loudly if another process takes it. */
export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error("No free port"))));
    });
  });

const waitForPage = async (url: string, child: ChildProcess, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`The lab server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The lab server did not answer ${url} within ${Math.round(timeoutMs / 1000)} s.`);
};

export interface LabServersDeps {
  /** For tests: start the server process. Default: the worktree's own Vite binary. */
  readonly start?: (worktree: string, port: number) => ChildProcess;
  readonly readyTimeoutMs?: number;
}

const startVite = (worktree: string, port: number): ChildProcess => {
  const ui = path.join(worktree, "tooling", "desk-ui");
  return spawn(
    path.join(ui, "node_modules", ".bin", "vite"),
    ["--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: ui,
      stdio: "ignore",
      detached: process.platform !== "win32",
      env: { ...process.env, NO_COLOR: "1" }
    }
  );
};

export const createLabServers = (deps: LabServersDeps = {}): LabServers => {
  const servers = new Map<number, { server: LabServer; child: ChildProcess }>();
  const starting = new Map<number, Promise<LabServer>>();

  const stop = async (jobId: number): Promise<void> => {
    const entry = servers.get(jobId);
    servers.delete(jobId);
    if (entry !== undefined) await stopProcessTree(entry.child);
  };

  const start = async (jobId: number, worktree: string): Promise<LabServer> => {
    const port = await freePort();
    const child = (deps.start ?? startVite)(worktree, port);
    const labUrl = `http://localhost:${port}/lab-frame.html`;
    try {
      await waitForPage(
        `http://127.0.0.1:${port}/lab-frame.html`,
        child,
        deps.readyTimeoutMs ?? READY_TIMEOUT_MS
      );
    } catch (error) {
      await stopProcessTree(child);
      throw error;
    }
    const server: LabServer = { port, labUrl, stop: () => stop(jobId) };
    servers.set(jobId, { server, child });
    child.once("exit", () => {
      if (servers.get(jobId)?.child === child) servers.delete(jobId);
    });
    return server;
  };

  return {
    ensure: (jobId, worktree) => {
      const running = servers.get(jobId);
      if (running !== undefined) return Promise.resolve(running.server);
      // Two callers at once share one start.
      const pending =
        starting.get(jobId) ?? start(jobId, worktree).finally(() => starting.delete(jobId));
      starting.set(jobId, pending);
      return pending;
    },
    get: (jobId) => servers.get(jobId)?.server ?? null,
    stop,
    stopAll: async () => {
      await Promise.all([...servers.keys()].map(stop));
    }
  };
};
