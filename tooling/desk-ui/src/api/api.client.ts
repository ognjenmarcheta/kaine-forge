import {
  DESK_REQUEST_HEADER,
  DESK_REQUEST_HEADER_VALUE,
  actionRequestSchema,
  actionResponseSchema,
  apiErrorSchema,
  githubListsSchema,
  healthFixAcceptedSchema,
  healthReportSchema,
  issueDetailSchema,
  issueListSchema,
  lessonIssueCreatedSchema,
  lessonIssueDraftSchema,
  lessonReportSchema,
  logResponseSchema,
  runStatsSchema,
  type ActionRequestInput,
  type ActionResponse,
  type ApiErrorCode,
  type ArtifactId,
  type GithubLists,
  type HealthFix,
  type HealthReport,
  type IssueDetail,
  type IssueSummary,
  type LessonIssueCreated,
  type LessonIssueDraft,
  type LessonReport,
  type LogResponse,
  type RunStats
} from "@repo/desk/contracts";
import { z } from "zod";

/** A server error code, or a failure on the way to the server. */
export type FailureCode = ApiErrorCode | "network" | "invalid-response";

export class DeskApiError extends Error {
  readonly code: FailureCode;
  readonly status: number;
  /** Raw engine text. The UI shows it escaped and never translates it. */
  readonly detail: string | null;

  constructor(code: FailureCode, status: number, detail: string | null) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = "DeskApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const isDeskApiError = (value: unknown): value is DeskApiError =>
  value instanceof DeskApiError;

/** Turn anything thrown into a `DeskApiError`, so callers never handle `unknown`. */
export const toApiError = (value: unknown): DeskApiError =>
  isDeskApiError(value) ? value : new DeskApiError("network", 0, null);

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const WRITE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
  [DESK_REQUEST_HEADER]: DESK_REQUEST_HEADER_VALUE
};

const sessionReplySchema = z.object({ ok: z.literal(true) });

export interface DeskApi {
  readonly exchangeSession: (token: string) => Promise<void>;
  readonly health: () => Promise<HealthReport>;
  /** Starts a repair. It answers once the repair runs; a `health-fix` event says how it ended. */
  readonly healthFix: (fix: HealthFix) => Promise<void>;
  readonly stats: () => Promise<RunStats>;
  /** Problems seen in several issues, from `lessons.jsonl`. */
  readonly lessons: () => Promise<LessonReport>;
  /** Mark a lesson handled. A second promote replaces the note. */
  readonly lessonPromote: (key: string, note: string | null) => Promise<LessonReport>;
  /** Make a promoted lesson a candidate again. */
  readonly lessonUnpromote: (key: string) => Promise<LessonReport>;
  /** The exact title and body the desk would send to GitHub for a lesson. */
  readonly lessonIssuePreview: (key: string) => Promise<LessonIssueDraft>;
  /** Open the issue of a previewed lesson. Call it only after the owner said yes to that preview. */
  readonly lessonIssue: (key: string, digest: string) => Promise<LessonIssueCreated>;
  /** Open issues and pull requests. `refresh` asks GitHub again instead of the server's cache. */
  readonly github: (refresh: boolean) => Promise<GithubLists>;
  readonly issues: () => Promise<IssueSummary[]>;
  readonly issue: (issueNumber: number) => Promise<IssueDetail>;
  readonly artifactText: (issueNumber: number, id: ArtifactId) => Promise<string>;
  readonly artifactJson: <T>(
    issueNumber: number,
    id: ArtifactId,
    schema: z.ZodType<T>
  ) => Promise<T>;
  readonly log: (issueNumber: number, after: number) => Promise<LogResponse>;
  /** `keepalive` lets the request finish while the page closes (an undo window that ends early). */
  readonly act: (
    issueNumber: number,
    request: ActionRequestInput,
    options?: { readonly keepalive?: boolean }
  ) => Promise<ActionResponse>;
}

/** The typed client for every route of the desk server. Each answer is parsed with its contract. */
export function createDeskApi(doFetch: FetchLike = defaultFetch): DeskApi {
  const send = async (path: string, init: RequestInit = {}): Promise<Response> => {
    let response: Response;
    try {
      response = await doFetch(path, { ...init, credentials: "same-origin" });
    } catch {
      throw new DeskApiError("network", 0, null);
    }
    if (response.ok) return response;
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new DeskApiError(parsed.data.error.code, response.status, parsed.data.error.detail);
    }
    throw new DeskApiError(
      response.status === 401 ? "unauthorized" : "internal",
      response.status,
      null
    );
  };

  const getJson = async <T>(path: string, schema: z.ZodType<T>): Promise<T> => {
    const response = await send(path);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeskApiError("invalid-response", response.status, null);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new DeskApiError("invalid-response", response.status, null);
    return parsed.data;
  };

  const postJson = async <B, T>(path: string, payload: B, schema: z.ZodType<T>): Promise<T> => {
    const response = await send(path, {
      method: "POST",
      headers: WRITE_HEADERS,
      body: JSON.stringify(payload)
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeskApiError("invalid-response", response.status, null);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new DeskApiError("invalid-response", response.status, null);
    return parsed.data;
  };

  const issuePath = (issueNumber: number): string => `/api/issues/${String(issueNumber)}`;

  return {
    exchangeSession: async (token) => {
      const response = await send("/api/session", {
        method: "POST",
        headers: WRITE_HEADERS,
        body: JSON.stringify({ token })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!sessionReplySchema.safeParse(body).success) {
        throw new DeskApiError("invalid-response", response.status, null);
      }
    },
    health: () => getJson("/api/health", healthReportSchema),
    stats: () => getJson("/api/stats", runStatsSchema),
    lessons: () => getJson("/api/lessons", lessonReportSchema),
    lessonPromote: (key, note) =>
      postJson("/api/lessons/promote", note === null ? { key } : { key, note }, lessonReportSchema),
    lessonUnpromote: (key) => postJson("/api/lessons/unpromote", { key }, lessonReportSchema),
    lessonIssuePreview: (key) =>
      getJson(`/api/lessons/issue-preview?key=${encodeURIComponent(key)}`, lessonIssueDraftSchema),
    lessonIssue: (key, digest) =>
      postJson("/api/lessons/issue", { key, digest, confirm: true }, lessonIssueCreatedSchema),
    github: (refresh) =>
      getJson(refresh ? "/api/github?refresh=1" : "/api/github", githubListsSchema),
    healthFix: async (fix) => {
      const response = await send("/api/health/fix", {
        method: "POST",
        headers: WRITE_HEADERS,
        body: JSON.stringify({ fix })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!healthFixAcceptedSchema.safeParse(body).success) {
        throw new DeskApiError("invalid-response", response.status, null);
      }
    },
    issues: async () => (await getJson("/api/issues", issueListSchema)).issues,
    issue: (issueNumber) => getJson(issuePath(issueNumber), issueDetailSchema),
    artifactText: async (issueNumber, id) =>
      (await send(`${issuePath(issueNumber)}/artifacts/${id}`)).text(),
    artifactJson: async (issueNumber, id, schema) => {
      const text = await (await send(`${issuePath(issueNumber)}/artifacts/${id}`)).text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new DeskApiError("invalid-response", 200, null);
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new DeskApiError("invalid-response", 200, null);
      return parsed.data;
    },
    log: (issueNumber, after) =>
      getJson(`${issuePath(issueNumber)}/log?after=${String(after)}`, logResponseSchema),
    act: async (issueNumber, request, options) => {
      const checked = actionRequestSchema.safeParse(request);
      if (!checked.success) {
        throw new DeskApiError("bad-request", 0, checked.error.issues[0]?.message ?? null);
      }
      const response = await send(`${issuePath(issueNumber)}/actions`, {
        method: "POST",
        headers: WRITE_HEADERS,
        body: JSON.stringify(checked.data),
        ...(options?.keepalive === true ? { keepalive: true } : {})
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new DeskApiError("invalid-response", response.status, null);
      }
      const parsed = actionResponseSchema.safeParse(body);
      if (!parsed.success) throw new DeskApiError("invalid-response", response.status, null);
      return parsed.data;
    }
  };
}
