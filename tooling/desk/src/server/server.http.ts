import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  actionRequestSchema,
  sessionRequestSchema,
  type ActionName,
  type ActionResponse,
  type ApiErrorCode,
  type HealthReport,
  type IssueState,
  type LogResponse,
  type ServerEvent
} from "../contracts";
import type { DoctorReport } from "../doctor/doctor.checks";
import { systemClock, type Clock } from "../ports";
import {
  createActionDispatcher,
  type Dispatched,
  type ServerRunner,
  type Settled
} from "./server.actions";
import { isArtifactId, ARTIFACT_SPECS, readArtifact } from "./server.artifacts";
import { DEFAULT_MAX_BODY_BYTES, readJsonBody } from "./server.body";
import { buildIssueDetail, summarizeResult, type DetailDeps } from "./server.detail";
import { HttpError, errorEnvelope, sendError, sendJson } from "./server.errors";
import {
  DEFAULT_LOG_CAPACITY,
  createLogBuffer,
  createSseHub,
  type PipelineEventSource
} from "./server.events";
import {
  applySecurityHeaders,
  createSecurity,
  sessionCookie,
  type Security
} from "./server.security";
import { createStaticHandler, type StaticHandler } from "./server.static";
import { createStoreWatcher } from "./server.watch";
import type { IssueStore } from "../store/store.issue";

export interface DeskServerDeps {
  readonly runner: ServerRunner;
  readonly store: IssueStore;
  /** The runner's `onEvent` feeds this. Live logs and quick updates come from it. */
  readonly events: PipelineEventSource;
  /** The doctor report. Results are cached for `healthTtlMs`. */
  readonly health: () => Promise<DoctorReport>;
  readonly clock?: Clock | undefined;
  /** Hash of the worktree diff now, for the ship panel. */
  readonly currentDiffHash?: ((state: IssueState) => Promise<string | null>) | undefined;
  /** Directory of the built UI. `null` or absent: the server serves the API only. */
  readonly uiDir?: string | null | undefined;
  /** Default 0: the system picks a free port. */
  readonly port?: number | undefined;
  /** Heartbeat comment on the event stream. Default 15 s. */
  readonly heartbeatMs?: number | undefined;
  /** How often the store is compared for changes made outside this server. Default 2 s. */
  readonly pollMs?: number | undefined;
  /** Use `fs.watch` to notice store changes sooner. Default true. */
  readonly useFsWatch?: boolean | undefined;
  /** An action that runs longer than this answers 202. Default 400 ms. */
  readonly actionSettleMs?: number | undefined;
  readonly healthTtlMs?: number | undefined;
  readonly maxBodyBytes?: number | undefined;
  readonly logCapacity?: number | undefined;
}

export interface DeskServer {
  readonly server: Server;
  /** `http://127.0.0.1:<port>`. */
  readonly url: string;
  /** `url` plus the one-use token in the fragment. A fragment never reaches a server or a log. */
  readonly launchUrl: string;
  /** Stop listening, end every connection, and release the timers. Safe to call twice. */
  readonly close: () => Promise<void>;
}

const DEFAULTS = {
  heartbeatMs: 15_000,
  pollMs: 2_000,
  actionSettleMs: 400,
  healthTtlMs: 10_000,
  requestTimeoutMs: 10_000
} as const;

const ISSUE_NUMBER = /^[1-9]\d{0,8}$/;

type Route =
  | { readonly kind: "session" | "health" | "events" | "issues" | "unknown" }
  | { readonly kind: "issue" | "log" | "actions"; readonly issueNumber: number }
  | { readonly kind: "artifact"; readonly issueNumber: number; readonly artifact: string };

const parseRoute = (pathname: string): Route => {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const [api, resource, id, sub, name] = segments;
  if (api !== "api") return { kind: "unknown" };
  if (segments.length === 2 && resource === "session") return { kind: "session" };
  if (segments.length === 2 && resource === "health") return { kind: "health" };
  if (segments.length === 2 && resource === "events") return { kind: "events" };
  if (resource !== "issues") return { kind: "unknown" };
  if (segments.length === 2) return { kind: "issues" };
  if (id === undefined || !ISSUE_NUMBER.test(id)) return { kind: "unknown" };
  const issueNumber = Number(id);
  if (segments.length === 3) return { kind: "issue", issueNumber };
  if (segments.length === 4 && sub === "log") return { kind: "log", issueNumber };
  if (segments.length === 4 && sub === "actions") return { kind: "actions", issueNumber };
  if (segments.length === 5 && sub === "artifacts" && name !== undefined) {
    return { kind: "artifact", issueNumber, artifact: name };
  }
  return { kind: "unknown" };
};

const METHOD_OF: Readonly<Record<Route["kind"], "GET" | "POST">> = {
  session: "POST",
  health: "GET",
  events: "GET",
  issues: "GET",
  issue: "GET",
  artifact: "GET",
  log: "GET",
  actions: "POST",
  unknown: "GET"
};

const parseTarget = (request: IncomingMessage, origin: string): URL => {
  const target = request.url ?? "/";
  // `//host/path` and backslashes would let a request name another host or escape the path.
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\")) {
    throw new HttpError("bad-request", "Malformed request target");
  }
  return new URL(target, origin);
};

const toHealthReport = (report: DoctorReport, clock: Clock): HealthReport => ({
  ok: report.ok,
  checks: report.checks.map((check) => ({
    id: check.id,
    label: check.label,
    status: check.status,
    detail: check.detail
  })),
  generatedAt: clock.now().toISOString()
});

const zodDetail = (error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): string =>
  error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(body)"}: ${issue.message}`)
    .join("; ");

const errorOf = (code: ApiErrorCode, detail: string | null) => errorEnvelope(code, detail).error;

/**
 * The desk server: REST, server-sent events and a built UI, on a loopback
 * port. See `docs/agents/agent-desk-api.md` for the routes and
 * `server.security.ts` for the security model.
 */
export const createDeskServer = async (deps: DeskServerDeps): Promise<DeskServer> => {
  const clock = deps.clock ?? systemClock;
  const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const healthTtlMs = deps.healthTtlMs ?? DEFAULTS.healthTtlMs;
  const staticHandler: StaticHandler | null =
    deps.uiDir === null || deps.uiDir === undefined ? null : createStaticHandler(deps.uiDir);

  const logBuffer = createLogBuffer(clock, deps.logCapacity ?? DEFAULT_LOG_CAPACITY);
  const hub = createSseHub({ heartbeatMs: deps.heartbeatMs ?? DEFAULTS.heartbeatMs });

  let security: Security | null = null;
  const requireSecurity = (): Security => {
    if (security === null) throw new Error("The server is not listening yet");
    return security;
  };

  // --- publishing -----------------------------------------------------------

  const detailDeps: DetailDeps = {
    store: deps.store,
    clock,
    isBusy: (issueNumber) => dispatcher.isBusy(issueNumber),
    currentDiffHash: deps.currentDiffHash
  };

  const publishIssue = async (issueNumber: number): Promise<void> => {
    if (hub.clientCount() === 0) return;
    const summary = await summarizeResult(
      detailDeps,
      issueNumber,
      await deps.store.read(issueNumber)
    );
    hub.broadcast(
      summary === null ? { type: "issue-removed", issueNumber } : { type: "issue-updated", summary }
    );
  };
  const publish = (issueNumber: number): void => {
    publishIssue(issueNumber).catch(() => undefined);
  };

  const logLine = (issueNumber: number, message: string): void => {
    const entry = logBuffer.append({ type: "log", issue: issueNumber, message });
    if (entry !== null) hub.broadcast({ type: "log", entry });
  };

  const dispatcher = createActionDispatcher({
    runner: deps.runner,
    settleMs: deps.actionSettleMs ?? DEFAULTS.actionSettleMs,
    log: logLine,
    onBusyChange: publish,
    onLate: (issueNumber, action: ActionName, settled: Settled) => {
      const event: ServerEvent = {
        type: "action-result",
        issueNumber,
        action,
        outcome: settled.kind === "done" ? settled.outcome : null,
        error:
          settled.kind === "refused"
            ? errorOf(settled.code, settled.detail)
            : settled.kind === "failed"
              ? errorOf("internal", null)
              : null
      };
      hub.broadcast(event);
      publish(issueNumber);
    }
  });

  const unsubscribe = deps.events.subscribe((event) => {
    const entry = logBuffer.append(event);
    if (entry !== null) hub.broadcast({ type: "log", entry });
    if (event.type === "state" || event.type === "history") publish(event.issue);
  });

  const watcher = createStoreWatcher({
    store: deps.store,
    pollMs: deps.pollMs ?? DEFAULTS.pollMs,
    useFsWatch: deps.useFsWatch ?? true,
    onChanged: publish,
    onRemoved: (issueNumber) => hub.broadcast({ type: "issue-removed", issueNumber })
  });
  hub.onActivity((active) => {
    if (!active) watcher.stop();
  });

  // --- health ---------------------------------------------------------------

  let healthCache: { readonly at: number; readonly report: HealthReport } | null = null;
  let healthInflight: Promise<HealthReport> | null = null;
  const health = (): Promise<HealthReport> => {
    if (healthCache !== null && clock.now().getTime() - healthCache.at < healthTtlMs) {
      return Promise.resolve(healthCache.report);
    }
    healthInflight ??= deps
      .health()
      .then((doctor) => {
        const report = toHealthReport(doctor, clock);
        healthCache = { at: clock.now().getTime(), report };
        hub.broadcast({ type: "health", report });
        return report;
      })
      .finally(() => {
        healthInflight = null;
      });
    return healthInflight;
  };

  // --- routes ---------------------------------------------------------------

  const readableState = async (issueNumber: number): Promise<void> => {
    const result = await deps.store.read(issueNumber);
    if (result.status === "missing") throw new HttpError("unknown-issue");
  };

  const handleSession = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    const active = requireSecurity();
    const parsed = sessionRequestSchema.safeParse(await readJsonBody(request, maxBodyBytes));
    if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
    const value = active.exchange(parsed.data.token);
    response.setHeader("Set-Cookie", sessionCookie(active.cookieName, value));
    sendJson(response, 200, { ok: true });
  };

  const handleActions = async (
    request: IncomingMessage,
    response: ServerResponse,
    issueNumber: number
  ): Promise<void> => {
    const parsed = actionRequestSchema.safeParse(await readJsonBody(request, maxBodyBytes));
    if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
    // Only `start` may create the state of an issue.
    if (parsed.data.action !== "start") await readableState(issueNumber);

    const result: Dispatched = await dispatcher.dispatch(issueNumber, parsed.data);
    switch (result.kind) {
      case "busy":
        throw new HttpError("busy", `An action of #${issueNumber} is still running`);
      case "refused":
        throw new HttpError(result.code, result.detail);
      case "failed":
        throw new HttpError("internal");
      case "accepted": {
        const body: ActionResponse = {
          status: "accepted",
          action: parsed.data.action,
          issueNumber
        };
        sendJson(response, 202, body);
        return;
      }
      case "done": {
        const body: ActionResponse = {
          status: "done",
          action: parsed.data.action,
          issueNumber,
          outcome: result.outcome
        };
        publish(issueNumber);
        sendJson(response, 200, body);
        return;
      }
    }
  };

  const handleArtifact = async (
    response: ServerResponse,
    issueNumber: number,
    name: string | undefined
  ): Promise<void> => {
    if (name === undefined || !isArtifactId(name)) throw new HttpError("not-found");
    await readableState(issueNumber);
    const read = await readArtifact(deps.store, issueNumber, name);
    if (read.status === "missing") throw new HttpError("artifact-missing");
    response.writeHead(200, {
      "Content-Type": ARTIFACT_SPECS[name].contentType,
      "Content-Length": read.bytes.length,
      ...(read.truncated ? { "X-Desk-Truncated": "1" } : {})
    });
    response.end(read.bytes);
  };

  const route = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL
  ): Promise<void> => {
    const active = requireSecurity();
    const found = parseRoute(url.pathname);
    if (found.kind === "unknown") throw new HttpError("not-found");
    if (request.method !== METHOD_OF[found.kind]) throw new HttpError("method-not-allowed");

    if (found.kind === "session") {
      await handleSession(request, response);
      return;
    }
    active.requireSession(request);

    switch (found.kind) {
      case "health":
        sendJson(response, 200, await health());
        return;
      case "events":
        // Take the baseline first: a change after "connected" must not be missed.
        await watcher.start();
        if (response.destroyed) {
          if (hub.clientCount() === 0) watcher.stop();
          return;
        }
        hub.add(request, response);
        return;
      case "issues": {
        const entries = await deps.store.list();
        const summaries = await Promise.all(
          entries.map((entry) => summarizeResult(detailDeps, entry.issueNumber, entry.result))
        );
        sendJson(response, 200, {
          issues: summaries.filter((summary) => summary !== null)
        });
        return;
      }
      case "issue": {
        const result = await buildIssueDetail(detailDeps, found.issueNumber);
        if (result.status === "missing") throw new HttpError("unknown-issue");
        if (result.status === "unreadable") {
          const { summary } = result;
          throw new HttpError(
            "unreadable",
            summary.readable ? null : `${summary.reason}: ${summary.detail}`
          );
        }
        sendJson(response, 200, result.detail);
        return;
      }
      case "artifact":
        await handleArtifact(response, found.issueNumber, found.artifact);
        return;
      case "log": {
        const issueNumber = found.issueNumber;
        const afterText = url.searchParams.get("after") ?? "0";
        if (!/^\d{1,15}$/.test(afterText))
          throw new HttpError("bad-request", "after is not a number");
        await readableState(issueNumber);
        const body: LogResponse = logBuffer.read(issueNumber, Number(afterText));
        sendJson(response, 200, body);
        return;
      }
      case "actions":
        await handleActions(request, response, found.issueNumber);
        return;
    }
  };

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applySecurityHeaders(response);
    try {
      const active = requireSecurity();
      active.checkRequest(request);
      const url = parseTarget(request, active.origin);
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        await route(request, response, url);
      } else if (staticHandler === null) {
        throw new HttpError("not-found");
      } else {
        if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
          response.setHeader("Set-Cookie", sessionCookie(active.cookieName, active.issueSession()));
        }
        await staticHandler.serve(request, response, url.pathname);
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendError(response, error.code, error.detail);
        return;
      }
      logLine(0, `request failed: ${error instanceof Error ? error.message : "unknown error"}`);
      sendError(response, "internal");
    }
  };

  // --- listen ---------------------------------------------------------------

  const server = createServer((request, response) => {
    void handle(request, response);
  });
  server.requestTimeout = DEFAULTS.requestTimeoutMs;
  server.headersTimeout = DEFAULTS.requestTimeoutMs;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(deps.port ?? 0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("The loopback listener is unavailable");
  }
  const { port }: AddressInfo = address;
  security = createSecurity({ port });
  const url = security.origin;

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      unsubscribe();
      watcher.stop();
      hub.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    })();
    return closing;
  };

  return { server, url, launchUrl: `${url}/#session=${security.launchToken}`, close };
};
