import { useCSRFPrevention } from "@graphql-yoga/plugin-csrf-prevention";
import { runWithAuditRequest, type AuditRequest } from "@repo/auth/audit";
import { auth as authInstance } from "@repo/auth/instance";
import { createServerAuth } from "@repo/auth/server";
import { createChildLogger, type Logger } from "@repo/logger";
import { toNodeHandler } from "better-auth/node";
import { useServer } from "graphql-ws/use/ws";
import { createYoga, type YogaInitialContext } from "graphql-yoga";
import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { createContext, createContextFromHeaders, type ApiKeyRequest } from "./context";
import { API_KEYS_CONFIG } from "./features/api-keys/api-keys.definition";
import { handleHealthRoute } from "./features/health/health.router";
import { formatApiError } from "./middleware/error.middleware";
import {
  createRateLimiter,
  resolveRateLimitConfig,
  resolveRateLimitKey,
  type RateLimitConfig
} from "./middleware/rate-limit.middleware";
import { errorReporter } from "./observability";
import { apiSchema } from "./schema";
import { createGraphQlLimitsPlugin, resolveApiRuntimeConfig } from "./server.config";

interface CreateApiServerOptions {
  logger: Logger;
  rateLimitConfig?: RateLimitConfig;
}

const REQUEST_ID_HEADER = "x-request-id";
// Response headers browser clients may read; CORS hides the rest.
const EXPOSED_HEADERS = [REQUEST_ID_HEADER];
// A caller-supplied id is logged verbatim, so only a short, log-safe charset is
// trusted; anything else is replaced.
const INCOMING_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(incoming: string | string[] | undefined): string {
  return typeof incoming === "string" && INCOMING_REQUEST_ID_PATTERN.test(incoming)
    ? incoming
    : randomUUID();
}

// Logs one completion line per request once the response is done (or the
// client went away). /health is probed every few seconds, so it stays at debug.
function logRequestCompletion(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  requestLogger: Logger,
  pathname: string
): void {
  const startedAt = performance.now();

  res.once("close", () => {
    const fields = {
      method: req.method,
      path: pathname,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt)
    };

    if (pathname === "/health") {
      requestLogger.debug(fields, "request completed");
    } else {
      requestLogger.info(fields, "request completed");
    }
  });
}

// better-auth (1.6.23) does not emit CORS response headers itself
// (trustedOrigins only feeds its CSRF origin check), so /api/auth/* keeps the
// same allowlist-based CORS handling the custom transport applied.
function applyAuthCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  allowedCorsOrigins: string[] | undefined
): void {
  // Responses differ by Origin even when the grant is withheld, so caches
  // must never store an origin-blind response.
  res.setHeader("vary", "Origin");

  const origin = req.headers.origin;

  if (!origin || !allowedCorsOrigins?.includes(origin)) {
    return;
  }

  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-expose-headers", EXPOSED_HEADERS.join(", "));
}

export function mergeWebSocketConnectionHeaders(
  headers: IncomingHttpHeaders,
  connectionParams: Record<string, unknown> | undefined
): IncomingHttpHeaders {
  const mergedHeaders: IncomingHttpHeaders = { ...headers };

  if (!connectionParams) {
    return mergedHeaders;
  }

  for (const [key, value] of Object.entries(connectionParams)) {
    if (typeof value === "string") {
      mergedHeaders[key.toLowerCase()] = value;
    }
  }

  return mergedHeaders;
}

export function createApiServer({
  logger,
  rateLimitConfig = resolveRateLimitConfig(process.env)
}: CreateApiServerOptions) {
  const auth = createServerAuth();
  const authHandler = toNodeHandler(authInstance.handler);
  const runtimeConfig = resolveApiRuntimeConfig(process.env);
  const rateLimiter = createRateLimiter(rateLimitConfig);
  // No-op unless OBSERVABILITY_ENABLED / SENTRY_DSN / OTEL endpoint is configured.
  // Dev/test may omit the allowlist (Yoga reflects any origin). Production
  // fails earlier in resolveApiRuntimeConfig when API_CORS_ORIGINS is empty.
  // allowedHeaders stays unset: Yoga then echoes the preflight's requested
  // headers, which lets allowlisted origins send x-graphql-yoga-csrf.
  const cors =
    runtimeConfig.allowedCorsOrigins === undefined
      ? { exposedHeaders: EXPOSED_HEADERS }
      : {
          credentials: true,
          exposedHeaders: EXPOSED_HEADERS,
          origin: runtimeConfig.allowedCorsOrigins
        };

  // handleRequest passes the request-scoped logger as server context, so
  // GraphQL context logs carry the same request id as the completion line.
  const yoga = createYoga<{ requestLogger?: Logger; apiKey?: ApiKeyRequest }>({
    schema: apiSchema,
    graphqlEndpoint: "/graphql",
    plugins: [
      // A GET or form/text POST is a "simple" request that browsers send
      // cross-site without a preflight; requiring a custom header blocks it.
      useCSRFPrevention({ requestHeaders: ["x-graphql-yoga-csrf"] }),
      createGraphQlLimitsPlugin({
        allowIntrospection: runtimeConfig.allowIntrospection,
        maxComplexity: runtimeConfig.maxQueryComplexity,
        maxDepth: runtimeConfig.maxQueryDepth
      })
    ],
    context: async (initialContext) => {
      // The node adapter merges { req } into the server context for HTTP
      // requests; yoga's inferred context type does not carry it, so declare
      // that extra property instead of asserting it.
      const serverContext: YogaInitialContext & {
        req?: { headers?: IncomingHttpHeaders };
      } = initialContext;
      const requestLogger = initialContext.requestLogger ?? logger;

      const nodeHeaders = serverContext.req?.headers;
      if (nodeHeaders) {
        return createContextFromHeaders(nodeHeaders, requestLogger, auth, initialContext.apiKey);
      }

      return createContext(serverContext.request, requestLogger, auth);
    },
    maskedErrors: runtimeConfig.maskedErrors,
    cors,
    // graphql-yoga always mounts its built-in health-check plugin and the
    // option only accepts a path (there is no `false`). Point it at a
    // namespaced internal path so it can never answer /health: our handler
    // owns GET /health, and POST /health now gets Yoga's regular 404 instead
    // of the built-in plugin's empty 200.
    healthCheckEndpoint: "/__yoga/health"
  });

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>
  ): Promise<void> => {
    // Assigned before routing so every response, including /health, auth, and
    // 429s, carries the id the logs use and the nosniff header.
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    const requestLogger = createChildLogger(logger, { requestId });
    const pathname = (req.url ?? "").split("?")[0] ?? "";

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader("x-content-type-options", "nosniff");
    logRequestCompletion(req, res, requestLogger, pathname);

    // Every Audit Event this request records, from an auth route or a
    // resolver, takes its client IP from the rate limiter's proxy rule.
    const ipAddress = resolveRateLimitKey(req, rateLimitConfig);
    const auditRequest: AuditRequest = {
      ipAddress: ipAddress === "unknown" ? null : ipAddress,
      logger: requestLogger,
      userAgent: req.headers["user-agent"] ?? null
    };
    await runWithAuditRequest(auditRequest, () =>
      routeRequest(req, res, requestLogger, pathname, auditRequest)
    );
  };

  // Lets browsers read the 429. An allowlisted origin is reflected with
  // credentials; open CORS (development only: production refuses to start
  // without an allowlist) answers `*`, which never grants credentials; any
  // other origin gets no CORS headers.
  const rejectTooManyRequests = (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    retryAfterSeconds: number
  ): void => {
    const origin = req.headers.origin;
    const allowedOrigins = runtimeConfig.allowedCorsOrigins;

    if (origin && allowedOrigins?.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    } else if (origin && allowedOrigins === undefined) {
      res.setHeader("access-control-allow-origin", "*");
    }

    res.statusCode = 429;
    res.setHeader("content-type", "application/json");
    res.setHeader("retry-after", String(retryAfterSeconds));
    res.setHeader("access-control-expose-headers", ["retry-after", ...EXPOSED_HEADERS].join(", "));
    res.end(JSON.stringify({ error: "too many requests" }));
  };

  const routeRequest = async (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    requestLogger: Logger,
    pathname: string,
    auditRequest: AuditRequest
  ): Promise<void> => {
    try {
      const handledHealth = await handleHealthRoute({ req, res });

      if (handledHealth) {
        return;
      }

      // Rate limit auth and GraphQL traffic only; health probes dispatched
      // above stay unthrottled and CORS preflights never consume the limit.
      // Note: websocket upgrades (/graphql subscriptions) bypass this limiter;
      // it covers plain HTTP requests only.
      const isRateLimitedPath =
        pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/graphql";
      // A GraphQL request with an API Key acts as the key's Organization and
      // has the key's own rate limit bucket. A client over its address limit
      // never reaches the key lookup, a value that is not shaped like a key
      // never reaches the database, and an unknown, revoked, or expired key
      // counts against the client address and gets 401.
      const clientKey = resolveRateLimitKey(req, rateLimitConfig);
      const presentedApiKey =
        req.method !== "OPTIONS" && pathname === "/graphql"
          ? req.headers[API_KEYS_CONFIG.header]
          : undefined;
      let apiKey: ApiKeyRequest | null = null;

      if (presentedApiKey !== undefined) {
        const clientLimit = rateLimiter.peek(clientKey);

        if (!clientLimit.allowed) {
          rejectTooManyRequests(req, res, clientLimit.retryAfterSeconds);
          return;
        }

        apiKey =
          typeof presentedApiKey === "string" && API_KEYS_CONFIG.pattern.test(presentedApiKey)
            ? await auth.resolveApiKey(presentedApiKey)
            : null;
      }

      if (req.method !== "OPTIONS" && isRateLimitedPath) {
        const key = apiKey ? `api-key:${apiKey.apiKeyId}` : clientKey;
        const decision = rateLimiter.check(key);

        if (!decision.allowed) {
          if (decision.firstRejection) {
            requestLogger.warn({ key }, "rate limit exceeded");
          }

          rejectTooManyRequests(req, res, decision.retryAfterSeconds);
          return;
        }
      }

      if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
        applyAuthCorsHeaders(req, res, runtimeConfig.allowedCorsOrigins);

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        await authHandler(req, res);
        return;
      }

      if (presentedApiKey !== undefined && !apiKey) {
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "invalid api key" }));
        return;
      }

      if (apiKey) {
        // Every Audit Event this request records names the key that acted.
        const keyRequest = apiKey;
        runWithAuditRequest({ ...auditRequest, apiKeyId: keyRequest.apiKeyId }, () => {
          void yoga(req, res, { requestLogger, apiKey: keyRequest });
        });
        return;
      }

      void yoga(req, res, { requestLogger });
    } catch (error) {
      errorReporter.captureException(error, {
        path: req.url ?? "",
        method: req.method ?? ""
      });
      requestLogger.error({ err: error }, "unhandled request error");
      const normalized = formatApiError(error, {
        exposeDetails: runtimeConfig.exposeErrorDetails
      });
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(normalized));
    }
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  const wsServer = new WebSocketServer({ server, path: "/graphql" });

  // One id per WebSocket connection, minted on first use: onClose also runs for
  // sockets that close before onConnect.
  const connectionLoggerFor = (extra: { connectionLogger?: Logger }): Logger =>
    (extra.connectionLogger ??= createChildLogger(logger, { connectionId: randomUUID() }));

  const subscriptions = useServer<
    Record<string, unknown> | undefined,
    { connectionLogger: Logger }
  >(
    {
      schema: apiSchema,
      context: async (ctx) => {
        const headers = ctx.extra.request.headers;
        const connectionParams = ctx.connectionParams;
        return createContextFromHeaders(
          mergeWebSocketConnectionHeaders(headers, connectionParams),
          connectionLoggerFor(ctx.extra),
          auth
        );
      },
      onConnect: async (ctx) => {
        const headers = ctx.extra.request.headers;
        const connectionParams = ctx.connectionParams;
        const session = await auth.getSessionFromHeaders(
          mergeWebSocketConnectionHeaders(headers, connectionParams)
        );
        if (!session) return false;
        connectionLoggerFor(ctx.extra).info("websocket connected");
        return true;
      },
      onClose: (ctx, code) => {
        connectionLoggerFor(ctx.extra).info({ code }, "websocket disconnected");
      }
    },
    wsServer
  );

  return {
    server,
    subscriptions,
    yoga,
    wsServer
  };
}
