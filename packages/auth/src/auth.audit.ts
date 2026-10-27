import { auditEventsTable, db } from "@repo/db";
import { createLogger, type Logger } from "@repo/logger";
import { AsyncLocalStorage } from "node:async_hooks";

import { AUDIT_ACTION_TARGETS, type AuditEventInput } from "./auth.audit.definition";

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
 * Writes one Audit Event. A failed write is logged and never thrown: the
 * action it records has already happened and must not fail because of it.
 */
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
    (request?.logger ?? auditLogger).error(
      { action: input.action, error: describeWriteError(error) },
      "audit event write failed"
    );
  }
}
