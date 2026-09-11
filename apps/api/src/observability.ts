import { createErrorReporter } from "@repo/logger";

/**
 * One owner of the reporting seam for the whole API. A no-op unless
 * OBSERVABILITY_ENABLED or a DSN is configured, so importing it costs nothing.
 */
export const errorReporter = createErrorReporter();

export interface LoggableError {
  message: string;
  name: string;
  stack: string | undefined;
}

/**
 * Reduces an error to the three fields that are safe to log.
 *
 * pino's default `err` serializer copies every enumerable property of an error
 * onto the record and then attaches the original object as `raw`. The AI SDK's
 * APICallError carries `requestBodyValues` — the outgoing request, so the system
 * prompt plus the whole conversation — and `responseBody`. Logging `{ err }` on
 * a model failure would therefore write user content into the log.
 *
 * Log this under a key other than `err` (the serializer is keyed on the name) so
 * only these three fields can reach a log line. `errorReporter.captureException`
 * already reduces to message and stack, so it can take the raw error.
 */
export function formatLoggableError(error: unknown): LoggableError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }

  return { message: String(error), name: "UnknownError", stack: undefined };
}
