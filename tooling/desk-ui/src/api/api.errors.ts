import { API_ERROR_CODES } from "@repo/desk/contracts";

import type { FailureCode } from "./api.client";

/** The translation key for each failure. Every server code and each client failure has one. */
export const FAILURE_MESSAGE_KEYS: Readonly<Record<FailureCode, string>> = {
  "bad-request": "desk.error.bad-request",
  unauthorized: "desk.error.unauthorized",
  forbidden: "desk.error.forbidden",
  "not-found": "desk.error.not-found",
  "method-not-allowed": "desk.error.method-not-allowed",
  "payload-too-large": "desk.error.payload-too-large",
  "unsupported-media-type": "desk.error.unsupported-media-type",
  busy: "desk.error.busy",
  "artifact-missing": "desk.error.artifact-missing",
  internal: "desk.error.internal",
  leased: "desk.error.leased",
  "unknown-issue": "desk.error.unknown-issue",
  unreadable: "desk.error.unreadable",
  "invalid-transition": "desk.error.invalid-transition",
  "ship-refused": "desk.error.ship-refused",
  "already-started": "desk.error.already-started",
  "intake-refused": "desk.error.intake-refused",
  authorization: "desk.error.authorization",
  "worktree-dirty": "desk.error.worktree-dirty",
  "remove-failed": "desk.error.remove-failed",
  network: "desk.error.network",
  "invalid-response": "desk.error.invalid-response"
};

export const ALL_FAILURE_CODES: readonly FailureCode[] = [
  ...API_ERROR_CODES,
  "network",
  "invalid-response"
];

export const failureMessageKey = (code: FailureCode): string => FAILURE_MESSAGE_KEYS[code];

/** The session is gone or was never made. The page tells the engineer to open the launch link again. */
export const isSessionLost = (code: FailureCode): boolean => code === "unauthorized";
