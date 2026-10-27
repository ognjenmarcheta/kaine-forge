import { auditEventsTable, db } from "@repo/db";
import { createLogger, type Logger } from "@repo/logger";
import { and, eq } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  AUDIT_ACTION_TARGETS,
  type AuditAction,
  type AuditEventInput
} from "./auth.audit.definition";

export * from "./auth.audit.definition";

/** The request an Audit Event is recorded for; the API server sets it per request. */
export interface AuditRequest {
  /** The client IP under the rate limiter's proxy rule. */
  ipAddress: string | null;
  logger?: Pick<Logger, "error">;
  userAgent: string | null;
}

const USER_AGENT_MAX_LENGTH = 512;

const auditRequestStorage = new AsyncLocalStorage<AuditRequest>();
const auditLogger = createLogger({ name: "audit" });

/** Runs `fn` with `request` as the request of every Audit Event it records. */
export function runWithAuditRequest<TResult>(request: AuditRequest, fn: () => TResult): TResult {
  return auditRequestStorage.run(request, fn);
}

// A failed query's message carries its parameters (emails, IPs), so only the
// error names and the driver's own message reach the log.
function describeWriteError(error: unknown): { cause: string | null; name: string } {
  if (!(error instanceof Error)) {
    return { cause: null, name: "UnknownError" };
  }

  return {
    cause: error.cause instanceof Error ? error.cause.message : null,
    name: error.name
  };
}

/**
 * Logs why an Audit Event was not recorded. The action it describes has
 * already happened, so the failure never reaches the caller.
 */
export function logAuditFailure(fields: { action?: string; path?: string }, error: unknown): void {
  (auditRequestStorage.getStore()?.logger ?? auditLogger).error(
    { ...fields, error: describeWriteError(error) },
    "audit event not recorded"
  );
}

/** Whether an event with this action already names this target. */
export async function hasAuditEvent(action: AuditAction, targetId: string): Promise<boolean> {
  const [event] = await db
    .select({ id: auditEventsTable.id })
    .from(auditEventsTable)
    .where(and(eq(auditEventsTable.action, action), eq(auditEventsTable.targetId, targetId)))
    .limit(1);
  return event !== undefined;
}

/** Writes one Audit Event. A failed write is logged and never thrown. */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const request = auditRequestStorage.getStore();

  try {
    await db.insert(auditEventsTable).values({
      action: input.action,
      actorUserId: input.actorUserId,
      ipAddress: request?.ipAddress ?? null,
      metadata: input.metadata,
      organizationId: input.organizationId,
      targetId: input.targetId,
      targetType: AUDIT_ACTION_TARGETS[input.action],
      userAgent: request?.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null
    });
  } catch (error) {
    logAuditFailure({ action: input.action }, error);
  }
}
