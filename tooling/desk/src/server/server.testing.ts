import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

import { DESK_REQUEST_HEADER, DESK_REQUEST_HEADER_VALUE, type IssueState } from "../contracts";
import type { ServerRunner } from "./server.actions";
import { createEventBus, type PipelineEventBus } from "./server.events";
import { createDeskServer, type DeskServer, type DeskServerDeps } from "./server.http";
import type { DoctorReport } from "../doctor/doctor.checks";
import type { PipelineResult } from "../engine/pipeline.types";
import { createIssueStore, type IssueStore } from "../store/store.issue";

/** Fixtures and helpers for the server tests. Production code never imports this file. */

const AT = "2026-03-01T10:00:00.000Z";

export const makeState = (
  issueNumber: number,
  overrides: Partial<IssueState> = {}
): IssueState => ({
  schemaVersion: 1,
  issueNumber,
  stage: "plan-gate",
  status: "waiting",
  resumeStage: null,
  branch: `KAINE-${issueNumber}-feat-thing`,
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history: [
    { at: AT, stage: "intake", event: "intake-started" },
    { at: AT, stage: "setup", event: "intake-complete", note: "contract 6/6" },
    { at: AT, stage: "plan", event: "stage-started" },
    { at: AT, stage: "plan", event: "plan-ready" }
  ],
  authorization: null,
  createdAt: AT,
  updatedAt: AT,
  ...overrides
});

export const stoppedAt = (state: IssueState, message: string | null = null): PipelineResult => ({
  outcome: "stopped",
  stop: "gate",
  state,
  message
});

export interface FakeRunner extends ServerRunner {
  readonly start: ReturnType<typeof vi.fn<ServerRunner["start"]>>;
  readonly approvePlan: ReturnType<typeof vi.fn<ServerRunner["approvePlan"]>>;
  readonly feedback: ReturnType<typeof vi.fn<ServerRunner["feedback"]>>;
  readonly continueFrom: ReturnType<typeof vi.fn<ServerRunner["continueFrom"]>>;
  readonly cancel: ReturnType<typeof vi.fn<ServerRunner["cancel"]>>;
  readonly remove: ReturnType<typeof vi.fn<ServerRunner["remove"]>>;
  readonly ship: ReturnType<typeof vi.fn<ServerRunner["ship"]>>;
}

export const makeFakeRunner = (): FakeRunner => {
  const done = (issue: number): Promise<PipelineResult> =>
    Promise.resolve(stoppedAt(makeState(issue), "Plan ready"));
  return {
    start: vi.fn<ServerRunner["start"]>((issue) => done(issue)),
    approvePlan: vi.fn<ServerRunner["approvePlan"]>((issue) => done(issue)),
    feedback: vi.fn<ServerRunner["feedback"]>((issue) => done(issue)),
    continueFrom: vi.fn<ServerRunner["continueFrom"]>((issue) => done(issue)),
    cancel: vi.fn<ServerRunner["cancel"]>((issue) => done(issue)),
    remove: vi.fn<ServerRunner["remove"]>(() =>
      Promise.resolve({ outcome: "removed", worktreeRemoved: true, branch: null })
    ),
    ship: vi.fn<ServerRunner["ship"]>((issue) => done(issue))
  };
};

export const deferred = <T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: Error) => void;
} => {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
};

/**
 * Watch `setInterval` and `clearInterval`. `active()` lists the intervals that
 * were created and not cleared since, so a test can prove a shutdown left none.
 */
export const trackIntervals = (): {
  readonly active: () => number;
  readonly restore: () => void;
} => {
  const live = new Set<unknown>();
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  // SAFETY: the wrapper forwards every argument to the real `setInterval` and returns its result.
  const setSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
    ...args: Parameters<typeof setInterval>
  ) => {
    const timer = realSet(...args);
    live.add(timer);
    return timer;
  }) as typeof setInterval);
  // SAFETY: the wrapper forwards its argument to the real `clearInterval`.
  const clearSpy = vi.spyOn(globalThis, "clearInterval").mockImplementation(((
    timer: Parameters<typeof clearInterval>[0]
  ) => {
    live.delete(timer);
    realClear(timer);
  }) as typeof clearInterval);
  return {
    active: () => live.size,
    restore: () => {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  };
};

export const okDoctor: DoctorReport = {
  ok: true,
  checks: [{ id: "node", label: "Node.js", status: "ok", detail: "v22.0.0" }]
};

export interface Harness {
  readonly desk: DeskServer;
  readonly runner: FakeRunner;
  readonly store: IssueStore;
  readonly bus: PipelineEventBus;
  readonly root: string;
  readonly health: ReturnType<typeof vi.fn<() => Promise<DoctorReport>>>;
  readonly token: string;
  /** Write a readable state and return it. */
  readonly seed: (issueNumber: number, overrides?: Partial<IssueState>) => Promise<IssueState>;
  /** Write a file under the issue's artifacts directory. */
  readonly artifact: (issueNumber: number, name: string, content: string) => Promise<string>;
  readonly cleanup: () => Promise<void>;
}

export type HarnessOptions = Partial<
  Omit<DeskServerDeps, "runner" | "store" | "events" | "health">
>;

/**
 * A real server on an ephemeral loopback port over a real store in a temporary
 * directory, with a fake runner. `cleanup()` closes the server and removes the directory.
 */
export const createHarness = async (options: HarnessOptions = {}): Promise<Harness> => {
  const root = await mkdtemp(path.join(tmpdir(), "desk-server-"));
  const store = createIssueStore(path.join(root, "state"));
  const runner = makeFakeRunner();
  const bus = createEventBus();
  const health = vi.fn<() => Promise<DoctorReport>>(() => Promise.resolve(okDoctor));
  const desk = await createDeskServer({
    runner,
    store,
    events: bus,
    health,
    pollMs: 30,
    heartbeatMs: 60_000,
    actionSettleMs: 50,
    ...options
  });
  const token = new URLSearchParams(new URL(desk.launchUrl).hash.slice(1)).get("session") ?? "";
  return {
    desk,
    runner,
    store,
    bus,
    root,
    health,
    token,
    seed: async (issueNumber, overrides = {}) => {
      const state = makeState(issueNumber, overrides);
      await store.write(state);
      return state;
    },
    artifact: async (issueNumber, name, content) => {
      const directory = store.artifactsDir(issueNumber);
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, name);
      await writeFile(file, content);
      return file;
    },
    cleanup: async () => {
      await desk.close();
      await rm(root, { recursive: true, force: true });
    }
  };
};

// --- raw HTTP -------------------------------------------------------------

export interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
  readonly json: () => unknown;
}

export interface RawRequest {
  readonly method?: string;
  readonly path: string;
  readonly headers?: Record<string, string>;
  readonly body?: string | Buffer;
  /** Send the body in chunks without Content-Length. */
  readonly chunked?: boolean;
}

/** One request with full control of the headers (a browser would not let a test set `Host`). */
export const raw = (desk: DeskServer, input: RawRequest): Promise<Reply> =>
  new Promise<Reply>((resolve, reject) => {
    const url = new URL(desk.url);
    const body = input.body === undefined ? undefined : Buffer.from(input.body);
    const request = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: input.path,
        method: input.method ?? "GET",
        headers: {
          ...(body !== undefined && input.chunked !== true
            ? { "Content-Length": String(body.length) }
            : {}),
          ...input.headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text,
            json: () => JSON.parse(text)
          });
        });
      }
    );
    request.on("error", reject);
    if (body !== undefined && input.chunked === true) {
      for (let offset = 0; offset < body.length; offset += 8192) {
        request.write(body.subarray(offset, offset + 8192));
      }
      request.end();
    } else {
      request.end(body);
    }
  });

export const SAME_ORIGIN = (desk: DeskServer): Record<string, string> => ({
  Origin: desk.url
});

export const WRITE_HEADERS = (desk: DeskServer): Record<string, string> => ({
  ...SAME_ORIGIN(desk),
  [DESK_REQUEST_HEADER]: DESK_REQUEST_HEADER_VALUE,
  "Content-Type": "application/json"
});

/** Trade the launch token for the session cookie, as the UI does. Returns the `Cookie` header value. */
export const login = async (harness: Pick<Harness, "desk" | "token">): Promise<string> => {
  const reply = await raw(harness.desk, {
    method: "POST",
    path: "/api/session",
    headers: WRITE_HEADERS(harness.desk),
    body: JSON.stringify({ token: harness.token })
  });
  if (reply.status !== 200) throw new Error(`login failed: ${reply.status} ${reply.text}`);
  const cookie = reply.headers["set-cookie"]?.[0]?.split(";")[0];
  if (cookie === undefined) throw new Error("login set no cookie");
  return cookie;
};

export interface Api {
  readonly cookie: string;
  readonly get: (path: string, headers?: Record<string, string>) => Promise<Reply>;
  readonly post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<Reply>;
}

export const authenticated = async (harness: Harness): Promise<Api> => {
  const cookie = await login(harness);
  return {
    cookie,
    get: (urlPath, headers = {}) =>
      raw(harness.desk, { path: urlPath, headers: { Cookie: cookie, ...headers } }),
    post: (urlPath, body, headers = {}) =>
      raw(harness.desk, {
        method: "POST",
        path: urlPath,
        headers: { ...WRITE_HEADERS(harness.desk), Cookie: cookie, ...headers },
        body: JSON.stringify(body)
      })
  };
};

// --- server-sent events ---------------------------------------------------

export interface SseFrame {
  readonly event: string | null;
  readonly data: unknown;
  readonly raw: string;
}

export interface SseClient {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  /** The next frame (an event or a comment) that satisfies `match`, or a rejection after `timeoutMs`. */
  readonly next: (match: (frame: SseFrame) => boolean, timeoutMs?: number) => Promise<SseFrame>;
  readonly closed: Promise<void>;
  readonly close: () => void;
}

const parseFrame = (text: string): SseFrame => {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  return { event, data: data.length === 0 ? null : JSON.parse(data.join("\n")), raw: text };
};

export const openEvents = (desk: DeskServer, cookie: string): Promise<SseClient> =>
  new Promise<SseClient>((resolve, reject) => {
    const url = new URL(desk.url);
    const frames: SseFrame[] = [];
    const waiting: (() => void)[] = [];
    let buffer = "";
    const closedSignal = deferred<void>();
    const request = httpRequest(
      { host: url.hostname, port: url.port, path: "/api/events", headers: { Cookie: cookie } },
      (response) => {
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          buffer += chunk;
          let split = buffer.indexOf("\n\n");
          while (split >= 0) {
            frames.push(parseFrame(buffer.slice(0, split)));
            buffer = buffer.slice(split + 2);
            split = buffer.indexOf("\n\n");
          }
          for (const wake of waiting.splice(0)) wake();
        });
        const finish = (): void => {
          closedSignal.resolve();
          for (const wake of waiting.splice(0)) wake();
        };
        response.on("end", finish);
        response.on("close", finish);
        response.on("error", finish);
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          closed: closedSignal.promise,
          close: () => request.destroy(),
          next: async (match, timeoutMs = 3000) => {
            const deadline = Date.now() + timeoutMs;
            for (;;) {
              const index = frames.findIndex(match);
              const [found] = index >= 0 ? frames.splice(index, 1) : [];
              if (found !== undefined) return found;
              const left = deadline - Date.now();
              if (left <= 0) throw new Error("Timed out waiting for an event");
              await new Promise<void>((wake) => {
                const timer = setTimeout(wake, left);
                waiting.push(() => {
                  clearTimeout(timer);
                  wake();
                });
              });
            }
          }
        });
      }
    );
    request.on("error", (error) => {
      closedSignal.resolve();
      reject(error);
    });
    request.end();
  });
