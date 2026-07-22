/**
 * Optional production error reporting seam.
 * Disabled by default: no network traffic unless configured.
 */

export interface ErrorReporter {
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
}

export type CreateErrorReporterOptions = {
  dsn?: string | undefined;
  enabled?: boolean | undefined;
  /**
   * Optional custom reporter (tests / alternate backends).
   * When omitted and DSN is set, a no-op-safe fetch-based Sentry envelope stub is used
   * only if `enabled` is true — without a real SDK dependency.
   */
  reporter?: ErrorReporter | undefined;
  fetchImpl?: typeof fetch | undefined;
};

const NOOP_REPORTER: ErrorReporter = {
  captureException() {
    // intentionally empty
  }
};

/**
 * Create an error reporter. With no DSN / enabled flag, returns a no-op.
 * When `SENTRY_DSN` (or options.dsn) is set and enabled, posts a minimal JSON payload
 * to a configurable endpoint for adopters to swap for a full SDK later.
 *
 * This is an integration seam, not a full Sentry/OTel SDK.
 */
export function createErrorReporter(
  options: CreateErrorReporterOptions = {},
  env: Record<string, string | undefined> = process.env
): ErrorReporter {
  if (options.reporter) {
    return options.reporter;
  }

  const dsn = options.dsn ?? env.SENTRY_DSN ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const enabled =
    options.enabled ??
    (env.OBSERVABILITY_ENABLED === "true" || Boolean(dsn && env.NODE_ENV === "production"));

  if (!enabled || !dsn) {
    return NOOP_REPORTER;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  // Prefer explicit ingest URL; otherwise treat DSN as opaque endpoint (adopter configures).
  const endpoint = env.OBSERVABILITY_INGEST_URL ?? dsn;

  return {
    captureException(error, context = {}) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      void fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "exception",
          message,
          stack,
          context,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {
        // Never throw from reporting; observability must not take down the request path.
      });
    }
  };
}
