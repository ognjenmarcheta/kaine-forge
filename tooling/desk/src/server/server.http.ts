import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  DEFINITION_ID_PATTERN,
  actionRequestSchema,
  actionTargetProblem,
  agentSaveRequestSchema,
  definitionCloneRequestSchema,
  definitionPromoteRequestSchema,
  flowSaveRequestSchema,
  healthFixRequestSchema,
  lessonIssueRequestSchema,
  lessonPromoteRequestSchema,
  lessonUnpromoteRequestSchema,
  sessionRequestSchema,
  type ActionName,
  type ActionResponse,
  type ApiErrorCode,
  type DefinitionKind,
  type DefinitionWriteResult,
  type GithubLists,
  type HealthFix,
  type HealthReport,
  type IssueState,
  type LogResponse,
  type LessonReport,
  type RunStats,
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
import type { DefinitionViews } from "./server.definitions";
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
import { toGithubLists, type OpenWork } from "../github/github.lists";
import { DEFAULT_FLOW_ID } from "../registry/registry.snapshot";
import type {
  Definition,
  DefinitionWriteOutcome,
  DefinitionWrites
} from "../registry/registry.write";
import { aggregateRuns, snapshotsOf } from "../stats/stats.aggregate";
import type { LessonActionResult, LessonActions } from "../stats/stats.lesson-desk";
import { aggregateLessons } from "../stats/stats.lessons";
import type { RunRecords } from "../stats/stats.runs";
import type { IssueStore } from "../store/store.issue";

export interface DeskServerDeps {
  readonly runner: ServerRunner;
  readonly store: IssueStore;
  /** The runner's `onEvent` feeds this. Live logs and quick updates come from it. */
  readonly events: PipelineEventSource;
  /** The doctor report. Results are cached for `healthTtlMs`. */
  readonly health: () => Promise<DoctorReport>;
  /** The repairs this desk can run. A repair the map lacks is refused. */
  readonly healthFixes?: Partial<Record<HealthFix, () => Promise<HealthFixOutcome>>> | undefined;
  readonly clock?: Clock | undefined;
  /** Hash of the worktree diff now, for the ship panel. */
  readonly currentDiffHash?: ((state: IssueState) => Promise<string | null>) | undefined;
  /** Open issues and pull requests from GitHub, for `GET /api/github`. Absent: the route says so. */
  readonly openWork?: (() => Promise<OpenWork>) | undefined;
  /** How long `GET /api/github` reuses a list. Default 60 s. `?refresh=1` asks again. */
  readonly githubTtlMs?: number | undefined;
  /** `runs.jsonl`, for `GET /api/stats` and the runs in the issue detail. Absent: no runs. */
  readonly readRuns?: (() => Promise<RunRecords>) | undefined;
  /** `maxPrRounds` of the config, for the issue summaries. Absent: the default. */
  readonly prRoundLimit?: number | undefined;
  /** Problems seen in several issues, for `GET /api/lessons`. Absent: none recorded. */
  readonly lessons?: (() => Promise<LessonReport>) | undefined;
  /** Promote, unpromote, and open an issue for a lesson. Absent: those routes answer `404`. */
  readonly lessonActions?: LessonActions | undefined;
  /** The registry's agents and flows, for `GET /api/agents` and `GET /api/flows`. Absent: none. */
  readonly readDefinitions?: (() => Promise<DefinitionViews>) | undefined;
  /** Save, clone, promote and delete agents and flows. Absent: those routes answer `404`. */
  readonly definitionWrites?: DefinitionWrites | undefined;
  /** The flow `start` picks for an issue with these labels. Absent: the built-in default flow. */
  readonly flowFor?: ((labels: readonly string[]) => string) | undefined;
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

/** How a repair ended. `detail` is engine text. */
export interface HealthFixOutcome {
  readonly ok: boolean;
  readonly detail: string;
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
  githubTtlMs: 60_000,
  requestTimeoutMs: 10_000
} as const;

const ISSUE_NUMBER = /^[1-9]\d{0,8}$/;

type Route =
  | {
      readonly kind:
        | "session"
        | "health"
        | "health-fix"
        | "github"
        | "stats"
        | "lessons"
        | "lesson-promote"
        | "lesson-unpromote"
        | "lesson-issue-preview"
        | "lesson-issue"
        | "events"
        | "issues"
        | "agents"
        | "flows"
        | "unknown";
    }
  | {
      readonly kind:
        "agent" | "flow" | "agent-clone" | "flow-clone" | "agent-promote" | "flow-promote";
      readonly id: string;
    }
  | { readonly kind: "issue" | "log" | "actions"; readonly issueNumber: number }
  | { readonly kind: "artifact"; readonly issueNumber: number; readonly artifact: string };

const parseRoute = (pathname: string): Route => {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  const [api, resource, id, sub, name] = segments;
  if (api !== "api") return { kind: "unknown" };
  if (segments.length === 2 && resource === "session") return { kind: "session" };
  if (segments.length === 2 && resource === "health") return { kind: "health" };
  if (segments.length === 3 && resource === "health" && id === "fix") return { kind: "health-fix" };
  if (segments.length === 2 && resource === "stats") return { kind: "stats" };
  if (segments.length === 2 && resource === "lessons") return { kind: "lessons" };
  if (segments.length === 3 && resource === "lessons") {
    if (id === "promote") return { kind: "lesson-promote" };
    if (id === "unpromote") return { kind: "lesson-unpromote" };
    if (id === "issue-preview") return { kind: "lesson-issue-preview" };
    if (id === "issue") return { kind: "lesson-issue" };
  }
  if (segments.length === 2 && resource === "github") return { kind: "github" };
  if (segments.length === 2 && resource === "events") return { kind: "events" };
  if (resource === "agents" || resource === "flows") {
    if (segments.length === 2) return { kind: resource };
    if (id === undefined || !DEFINITION_ID_PATTERN.test(id)) return { kind: "unknown" };
    const kind = resource === "agents" ? "agent" : "flow";
    if (segments.length === 3) return { kind, id };
    if (segments.length === 4 && sub === "clone") return { kind: `${kind}-clone`, id };
    if (segments.length === 4 && sub === "promote") return { kind: `${kind}-promote`, id };
    return { kind: "unknown" };
  }
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

type Method = "GET" | "POST" | "PUT" | "DELETE";

/** The methods each route answers. Every other method is `405`. */
const METHODS_OF: Readonly<Record<Route["kind"], readonly Method[]>> = {
  session: ["POST"],
  health: ["GET"],
  "health-fix": ["POST"],
  github: ["GET"],
  stats: ["GET"],
  lessons: ["GET"],
  "lesson-promote": ["POST"],
  "lesson-unpromote": ["POST"],
  "lesson-issue-preview": ["GET"],
  "lesson-issue": ["POST"],
  events: ["GET"],
  issues: ["GET"],
  agents: ["GET"],
  agent: ["GET", "PUT", "DELETE"],
  "agent-clone": ["POST"],
  "agent-promote": ["POST"],
  flows: ["GET"],
  flow: ["GET", "PUT", "DELETE"],
  "flow-clone": ["POST"],
  "flow-promote": ["POST"],
  issue: ["GET"],
  artifact: ["GET"],
  log: ["GET"],
  actions: ["POST"],
  unknown: ["GET"]
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
    detail: check.detail,
    command: check.command ?? null,
    fix: check.fix ?? null
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

/** A definition write answers its result, or the error envelope of its refusal. */
const sendDefinitionOutcome = (
  response: ServerResponse,
  outcome: DefinitionWriteOutcome,
  status = 200
): void => {
  if (!outcome.ok) throw new HttpError(outcome.code, outcome.detail);
  const body: DefinitionWriteResult = outcome.result;
  sendJson(response, status, body);
};

/**
 * The desk server: REST, server-sent events and a built UI, on a loopback
 * port. See `docs/agents/agent-desk-api.md` for the routes and
 * `server.security.ts` for the security model.
 */
/**
 * Says what holds a port the desk cannot bind. A desk answers an API call
 * without a session with this 401 message. On Windows, stopping
 * `pnpm desk:run` can leave its node process serving the old port.
 */
const portTakenMessage = async (port: number): Promise<string> => {
  const desk = await fetch(`http://127.0.0.1:${port}/api/issues`, {
    signal: AbortSignal.timeout(2_000)
  }).then(
    async (response) =>
      response.status === 401 && (await response.text()).includes("Open the launch URL"),
    () => false
  );
  return desk
    ? `Port ${port} is in use by another desk server. Open http://127.0.0.1:${port}/, or stop it first. A stopped 'pnpm desk:run' can leave it running; 'netstat -ano | findstr :${port}' (Windows) or 'lsof -i :${port}' shows its pid.`
    : `Port ${port} is in use by another program. Pick another --port, or leave it out to take a free port.`;
};

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
    currentDiffHash: deps.currentDiffHash,
    readRuns: deps.readRuns,
    prRoundLimit: deps.prRoundLimit
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

  // --- GitHub lists ---------------------------------------------------------

  // One `gh` round trip per minute at most. The board marks follow the store on every request.
  let openWorkCache: { readonly at: number; readonly work: OpenWork } | null = null;
  let openWorkInflight: Promise<OpenWork> | null = null;
  const githubLists = async (refresh: boolean): Promise<GithubLists> => {
    const fetchedAt = clock.now();
    if (deps.openWork === undefined) {
      return {
        ok: false,
        reason: "This desk has no GitHub access.",
        fetchedAt: fetchedAt.toISOString()
      };
    }
    const ttl = deps.githubTtlMs ?? DEFAULTS.githubTtlMs;
    const fresh = openWorkCache !== null && fetchedAt.getTime() - openWorkCache.at < ttl;
    try {
      let work: OpenWork;
      if (fresh && !refresh && openWorkCache !== null) {
        work = openWorkCache.work;
      } else {
        openWorkInflight ??= deps.openWork().finally(() => {
          openWorkInflight = null;
        });
        work = await openWorkInflight;
        openWorkCache = { at: fetchedAt.getTime(), work };
      }
      const at = new Date(openWorkCache?.at ?? fetchedAt.getTime()).toISOString();
      return toGithubLists(
        work,
        await deps.store.list(),
        at,
        deps.flowFor ?? (() => DEFAULT_FLOW_ID)
      );
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "gh could not list the open work",
        fetchedAt: fetchedAt.toISOString()
      };
    }
  };

  // --- repairs --------------------------------------------------------------

  /** One repair at a time. It outlives its request: a build takes minutes. */
  let repairing: HealthFix | null = null;

  const handleHealthFix = async (request: IncomingMessage, response: ServerResponse) => {
    const parsed = healthFixRequestSchema.safeParse(await readJsonBody(request, maxBodyBytes));
    if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
    const { fix } = parsed.data;
    const run = deps.healthFixes?.[fix];
    if (run === undefined) throw new HttpError("not-found", `This desk cannot run '${fix}'.`);
    if (repairing !== null) throw new HttpError("busy", `'${repairing}' still runs.`);
    repairing = fix;
    logLine(0, `repair ${fix} started`);
    void run()
      .catch((error: unknown): HealthFixOutcome => ({
        ok: false,
        detail: error instanceof Error ? error.message : "the repair failed"
      }))
      .then(async (outcome) => {
        repairing = null;
        logLine(0, `repair ${fix} ${outcome.ok ? "done" : "failed"}: ${outcome.detail}`);
        hub.broadcast({ type: "health-fix", result: { fix, ...outcome } });
        // The next report shows the result, and its broadcast updates every page.
        healthCache = null;
        await health();
      })
      .catch(() => undefined);
    sendJson(response, 202, { fix, status: "running" });
  };

  // --- agents and flows -----------------------------------------------------

  const definitions = (): Promise<DefinitionViews> =>
    deps.readDefinitions?.() ??
    Promise.resolve({ agents: { agents: [], problems: [] }, flows: { flows: [], problems: [] } });

  const requireDefinitionWrites = (): DefinitionWrites => {
    if (deps.definitionWrites === undefined) {
      throw new HttpError("not-found", "This desk cannot change agents and flows.");
    }
    return deps.definitionWrites;
  };

  /** Save (`PUT`) or delete (`DELETE`) the definition `id` of `kind`. Local definitions only. */
  const handleDefinitionWrite = async (
    request: IncomingMessage,
    response: ServerResponse,
    kind: DefinitionKind,
    id: string
  ): Promise<void> => {
    const writes = requireDefinitionWrites();
    if (request.method === "DELETE") {
      sendDefinitionOutcome(response, await writes.remove(kind, id));
      return;
    }
    const body = await readJsonBody(request, maxBodyBytes);
    let write: Definition;
    if (kind === "agent") {
      const parsed = agentSaveRequestSchema.safeParse(body);
      if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
      write = { kind, definition: parsed.data.definition };
    } else {
      const parsed = flowSaveRequestSchema.safeParse(body);
      if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
      write = { kind, definition: parsed.data.definition };
    }
    if (write.definition.id !== id) {
      throw new HttpError(
        "bad-request",
        `The path names '${id}', the definition '${write.definition.id}'.`
      );
    }
    sendDefinitionOutcome(response, await writes.save(write));
  };

  /** `clone` answers `201`; `promote` answers `200`. */
  const handleDefinitionAction = async (
    request: IncomingMessage,
    response: ServerResponse,
    kind: DefinitionKind,
    action: "clone" | "promote",
    id: string
  ): Promise<void> => {
    const writes = requireDefinitionWrites();
    const body = await readJsonBody(request, maxBodyBytes);
    if (action === "clone") {
      const parsed = definitionCloneRequestSchema.safeParse(body);
      if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
      const outcome = await writes.clone(kind, id, parsed.data.id, parsed.data.name);
      sendDefinitionOutcome(response, outcome, 201);
      return;
    }
    const parsed = definitionPromoteRequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
    sendDefinitionOutcome(response, await writes.promote(kind, id, parsed.data.confirm));
  };

  // --- routes ---------------------------------------------------------------

  const readableState = async (issueNumber: number) => {
    const result = await deps.store.read(issueNumber);
    if (result.status === "missing") throw new HttpError("unknown-issue");
    return result;
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
    if (parsed.data.action !== "start") {
      const read = await readableState(issueNumber);
      // A target must be a step of the issue's own flow, of a kind that can take it.
      const problem =
        read.status === "ok"
          ? actionTargetProblem(read.state.flowSnapshot.flow, parsed.data)
          : null;
      if (problem !== null) throw new HttpError("bad-request", problem);
    }

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

  // --- lessons --------------------------------------------------------------

  const requireLessonActions = (): LessonActions => {
    if (deps.lessonActions === undefined) {
      throw new HttpError("not-found", "This desk cannot change lessons.");
    }
    return deps.lessonActions;
  };

  const lessonValue = <T>(result: LessonActionResult<T>): T => {
    if (!result.ok) throw new HttpError(result.code, result.detail);
    return result.value;
  };

  const handleLesson = async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    kind: "lesson-promote" | "lesson-unpromote" | "lesson-issue-preview" | "lesson-issue"
  ): Promise<void> => {
    const actions = requireLessonActions();
    switch (kind) {
      case "lesson-issue-preview": {
        const parsed = lessonUnpromoteRequestSchema.safeParse({ key: url.searchParams.get("key") });
        if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
        sendJson(response, 200, lessonValue(await actions.issuePreview(parsed.data.key)));
        return;
      }
      case "lesson-promote": {
        const parsed = lessonPromoteRequestSchema.safeParse(
          await readJsonBody(request, maxBodyBytes)
        );
        if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
        const { key, note } = parsed.data;
        sendJson(response, 200, lessonValue(await actions.promote(key, note ?? null)));
        return;
      }
      case "lesson-unpromote": {
        const parsed = lessonUnpromoteRequestSchema.safeParse(
          await readJsonBody(request, maxBodyBytes)
        );
        if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
        sendJson(response, 200, lessonValue(await actions.unpromote(parsed.data.key)));
        return;
      }
      case "lesson-issue": {
        // Opening an issue writes to GitHub. Only an explicit yes and the previewed text pass.
        const parsed = lessonIssueRequestSchema.safeParse(
          await readJsonBody(request, maxBodyBytes)
        );
        if (!parsed.success) throw new HttpError("bad-request", zodDetail(parsed.error));
        const { key, digest } = parsed.data;
        sendJson(response, 200, lessonValue(await actions.createIssue(key, digest)));
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
    if (!METHODS_OF[found.kind].some((method) => method === request.method)) {
      throw new HttpError("method-not-allowed");
    }

    if (found.kind === "session") {
      await handleSession(request, response);
      return;
    }
    active.requireSession(request);

    switch (found.kind) {
      case "health":
        sendJson(response, 200, await health());
        return;
      case "health-fix":
        await handleHealthFix(request, response);
        return;
      case "github":
        sendJson(response, 200, await githubLists(url.searchParams.get("refresh") === "1"));
        return;
      case "stats": {
        const runs = (await deps.readRuns?.()) ?? { records: [], invalidLines: 0 };
        const stats: RunStats = aggregateRuns(runs, snapshotsOf(await deps.store.list()), {
          now: clock.now()
        });
        sendJson(response, 200, stats);
        return;
      }
      case "lessons": {
        const report: LessonReport =
          (await deps.lessons?.()) ?? aggregateLessons({ records: [], invalidLines: 0 });
        sendJson(response, 200, report);
        return;
      }
      case "lesson-promote":
      case "lesson-unpromote":
      case "lesson-issue-preview":
      case "lesson-issue":
        await handleLesson(request, response, url, found.kind);
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
      case "agents":
        sendJson(response, 200, (await definitions()).agents);
        return;
      case "agent": {
        if (request.method !== "GET") {
          await handleDefinitionWrite(request, response, "agent", found.id);
          return;
        }
        const { agents } = (await definitions()).agents;
        const view = agents.find((entry) => entry.definition.id === found.id);
        if (view === undefined) throw new HttpError("not-found", `No agent '${found.id}'.`);
        sendJson(response, 200, view);
        return;
      }
      case "flows":
        sendJson(response, 200, (await definitions()).flows);
        return;
      case "flow": {
        if (request.method !== "GET") {
          await handleDefinitionWrite(request, response, "flow", found.id);
          return;
        }
        const { flows } = (await definitions()).flows;
        const view = flows.find((entry) => entry.definition.id === found.id);
        if (view === undefined) throw new HttpError("not-found", `No flow '${found.id}'.`);
        sendJson(response, 200, view);
        return;
      }
      case "agent-clone":
      case "flow-clone":
      case "agent-promote":
      case "flow-promote":
        await handleDefinitionAction(
          request,
          response,
          found.kind.startsWith("agent") ? "agent" : "flow",
          found.kind.endsWith("clone") ? "clone" : "promote",
          found.id
        );
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
  }).catch(async (error: unknown) => {
    const taken = error instanceof Error && "code" in error && error.code === "EADDRINUSE";
    if (taken && deps.port !== undefined) throw new Error(await portTakenMessage(deps.port));
    throw error;
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
