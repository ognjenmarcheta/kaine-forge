import type { ServerResponse } from "node:http";

import type { ApiError, ApiErrorCode } from "../contracts";

/** HTTP status of each error code. Runner refusals are conflicts, except an unknown issue. */
export const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  "bad-request": 400,
  unauthorized: 401,
  forbidden: 403,
  "not-found": 404,
  "method-not-allowed": 405,
  "payload-too-large": 413,
  "unsupported-media-type": 415,
  busy: 409,
  "artifact-missing": 404,
  internal: 500,
  leased: 409,
  "unknown-issue": 404,
  unreadable: 409,
  "invalid-transition": 409,
  "ship-refused": 409,
  "already-started": 409,
  "intake-refused": 409,
  authorization: 409,
  "worktree-dirty": 409,
  "remove-failed": 409
};

/** A request failure with a stable code. The router turns it into an error envelope. */
export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly code: ApiErrorCode;
  readonly detail: string | null;

  constructor(code: ApiErrorCode, detail: string | null = null) {
    super(`${code}${detail === null ? "" : `: ${detail}`}`);
    this.code = code;
    this.detail = detail;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export const errorEnvelope = (code: ApiErrorCode, detail: string | null = null): ApiError => ({
  error: { code, detail }
});

/** Write a JSON document. Headers that were set earlier (security headers) stay. */
export const sendJson = (response: ServerResponse, status: number, value: unknown): void => {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
};

export const sendError = (
  response: ServerResponse,
  code: ApiErrorCode,
  detail: string | null = null
): void => {
  // An error may leave an unread request body. Close the connection instead of draining it.
  if (code === "payload-too-large") response.setHeader("Connection", "close");
  sendJson(response, STATUS_BY_CODE[code], errorEnvelope(code, detail));
};
