import { PLAN_LIMIT_REACHED } from "@repo/billing";
import type { SyncMutationOutcome } from "@repo/db";
import { GraphQLError } from "graphql";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_KIND = "sync";

/**
 * Where a client stands: it holds every change up to `version`. `floor` is
 * the Organization's version when its first pull began; it needs no Tombstone
 * at or below `max(version, floor)`, since it never held a row deleted then.
 */
export interface SyncPosition {
  version: number;
  floor: number;
}

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function isVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// A cursor names its Organization, so one from another Organization is
// refused instead of pulling from a foreign position.
export function encodeSyncCursor(organizationId: string, position: SyncPosition): string {
  return Buffer.from(
    JSON.stringify([CURSOR_KIND, organizationId, position.version, position.floor])
  ).toString("base64url");
}

export function decodeSyncCursor(cursor: string, organizationId: string): SyncPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw badInput("invalid cursor");
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw badInput("invalid cursor");
  const [kind, cursorOrganizationId, version, floor] = parsed;
  if (
    kind !== CURSOR_KIND ||
    cursorOrganizationId !== organizationId ||
    !isVersion(version) ||
    !isVersion(floor)
  ) {
    throw badInput("invalid cursor");
  }
  return { version, floor };
}

/** Throws `invalid id` unless the value is a UUID, before it reaches a uuid column. */
export function ensureUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error("invalid id");
  }
  return value;
}

export function ensureIdempotencyKey(key: string, maxLength: number): string {
  if (key.length === 0 || key.length > maxLength) {
    throw badInput("invalid idempotency key");
  }
  return key;
}

/**
 * The rejection a module error stands for, or null for an error the client
 * should retry (a database or network failure). Rejected mutations roll back
 * on the client; retrying them could never succeed.
 */
export function rejectionCode(error: unknown): SyncMutationOutcome["code"] {
  if (!(error instanceof Error)) return null;
  // Retrying never fits a full Plan: the client rolls the create back.
  if (error instanceof GraphQLError && error.extensions["code"] === PLAN_LIMIT_REACHED) {
    return "PLAN_LIMIT_REACHED";
  }
  const { message } = error;
  if (message.startsWith("permission required")) return "FORBIDDEN";
  if (message.endsWith(" not found")) return "NOT_FOUND";
  if (message.endsWith(" id conflict")) return "CONFLICT";
  if (
    message === "invalid id" ||
    message.endsWith(" title is required") ||
    message.endsWith(" title is too long")
  ) {
    return "INVALID";
  }
  return null;
}
