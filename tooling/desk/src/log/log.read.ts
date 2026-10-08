import { watch } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { ROTATED_LOG_NAME, agentLogPath } from "./log.writer";
import type { IssueStore } from "../store/store.issue";

export interface LogLines {
  /** Complete lines, oldest first: the rotated file, then the current file. */
  readonly lines: readonly string[];
  /** Size of the current file when it was read. `followLog` continues from here. */
  readonly offset: number;
}

const readIfPresent = async (file: string): Promise<string> => {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
};

const splitLines = (text: string): string[] => text.split("\n").filter((line) => line !== "");

/** Read the whole persisted log of an issue. A missing file gives no lines. */
export const readLogLines = async (store: IssueStore, issue: number): Promise<LogLines> => {
  const current = agentLogPath(store, issue);
  const rotated = path.join(path.dirname(current), ROTATED_LOG_NAME);
  const [older, newer] = await Promise.all([readIfPresent(rotated), readIfPresent(current)]);
  // Only complete lines: a writer may be in the middle of a line.
  const complete = newer.slice(0, newer.lastIndexOf("\n") + 1);
  return {
    lines: [...splitLines(older), ...splitLines(complete)],
    offset: Buffer.byteLength(complete)
  };
};

export interface FollowOptions {
  readonly store: IssueStore;
  readonly issue: number;
  readonly offset: number;
  readonly onLines: (lines: readonly string[]) => void;
  readonly signal: AbortSignal;
  /** Poll interval. `fs.watch` wakes the loop sooner when the platform supports it. */
  readonly intervalMs: number;
}

/** Sleep until the directory changes, the interval ends, or the signal aborts. */
const waitForChange = (dir: string, intervalMs: number, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    let watcher: ReturnType<typeof watch> | undefined;
    const done = (): void => {
      clearTimeout(timer);
      watcher?.close();
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, intervalMs);
    signal.addEventListener("abort", done, { once: true });
    try {
      watcher = watch(dir, done);
      watcher.on("error", () => undefined);
    } catch {
      // No watcher on this platform or directory: the poll interval is enough.
    }
  });

/**
 * `tail -f` for the issue log: print what grows after `offset` until the
 * signal aborts. A shorter file means a rotation, so reading restarts at 0.
 */
export const followLog = async (options: FollowOptions): Promise<void> => {
  const file = agentLogPath(options.store, options.issue);
  const dir = path.dirname(file);
  let offset = options.offset;
  let partial = "";

  while (!options.signal.aborted) {
    let size = 0;
    try {
      size = (await stat(file)).size;
    } catch {
      size = 0;
    }
    if (size < offset) {
      offset = 0;
      partial = "";
    }
    if (size > offset) {
      const handle = await open(file, "r");
      try {
        const buffer = Buffer.alloc(size - offset);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        offset += bytesRead;
        partial += buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await handle.close();
      }
      const cut = partial.lastIndexOf("\n");
      if (cut >= 0) {
        options.onLines(splitLines(partial.slice(0, cut + 1)));
        partial = partial.slice(cut + 1);
      }
    }
    await waitForChange(dir, options.intervalMs, options.signal);
  }
};
