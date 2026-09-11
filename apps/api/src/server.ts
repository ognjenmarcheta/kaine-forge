import { auth as authInstance } from "@repo/auth/instance";
import { createServerAuth } from "@repo/auth/server";
import { type Logger } from "@repo/logger";
import { toNodeHandler } from "better-auth/node";
import { useServer } from "graphql-ws/use/ws";
import { createYoga, type YogaInitialContext } from "graphql-yoga";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { createContext, createContextFromHeaders } from "./context";
import { handleHealthRoute } from "./features/health/health.router";
import { formatApiError } from "./middleware/error.middleware";
import {
  createRateLimiter,
  resolveRateLimitConfig,
  resolveRateLimitKey,
  type RateLimitConfig
} from "./middleware/rate-limit.middleware";
import { errorReporter } from "./observability";
import { createLoggerPlugin } from "./plugins/logger.plugin";
import { apiSchema } from "./schema";
import { createGraphQlLimitsPlugin, resolveApiRuntimeConfig } from "./server.config";

interface CreateApiServerOptions {
  logger: Logger;
  rateLimitConfig?: RateLimitConfig;
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
  const cors =
    runtimeConfig.allowedCorsOrigins === undefined
      ? true
      : {
          credentials: true,
          origin: runtimeConfig.allowedCorsOrigins
        };

  const yoga = createYoga({
    schema: apiSchema,
    graphqlEndpoint: "/graphql",
    plugins: [
      createLoggerPlugin({ logger }),
      createGraphQlLimitsPlugin({
        allowIntrospection: runtimeConfig.allowIntrospection,
        maxComplexity: runtimeConfig.maxQueryComplexity,
        maxDepth: runtimeConfig.maxQueryDepth
      })
    ],
    context: async (initialContext) => {
      // The node adapter merges { req } into the server context for HTTP
      // requests and the logger plugin stashes a request-scoped child logger
      // on the same object; yoga's inferred context type carries neither, so
      // declare those extra properties instead of asserting them.
      const serverContext: YogaInitialContext & {
        req?: { headers?: IncomingHttpHeaders };
        requestLogger?: Logger;
      } = initialContext;
      const requestLogger = serverContext.requestLogger ?? logger;

      const nodeHeaders = serverContext.req?.headers;
      if (nodeHeaders) {
        return createContextFromHeaders(nodeHeaders, requestLogger, auth);
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
    try {
      const handledHealth = await handleHealthRoute({ req, res });

      if (handledHealth) {
        return;
      }

      // Rate limit auth and GraphQL traffic only; health probes dispatched
      // above stay unthrottled and CORS preflights never consume the limit.
      // Note: websocket upgrades (/graphql subscriptions) bypass this limiter;
      // it covers plain HTTP requests only.
      const pathname = (req.url ?? "").split("?")[0] ?? "";
      const isRateLimitedPath =
        pathname === "/api/auth" || pathname.startsWith("/api/auth/") || pathname === "/graphql";

      if (req.method !== "OPTIONS" && isRateLimitedPath) {
        const key = resolveRateLimitKey(req, rateLimitConfig.trustProxy);
        const decision = rateLimiter.check(key);

        if (!decision.allowed) {
          if (decision.firstRejection) {
            logger.warn({ key }, "rate limit exceeded");
          }

          // Mirror the yoga CORS behavior (reflect the origin when CORS is
          // open or the origin is allowlisted) so browsers can read the 429.
          const origin = req.headers.origin;

          if (
            origin &&
            (runtimeConfig.allowedCorsOrigins === undefined ||
              runtimeConfig.allowedCorsOrigins.includes(origin))
          ) {
            res.setHeader("access-control-allow-origin", origin);
            res.setHeader("access-control-allow-credentials", "true");
          }

          res.statusCode = 429;
          res.setHeader("content-type", "application/json");
          res.setHeader("retry-after", String(decision.retryAfterSeconds));
          res.setHeader("access-control-expose-headers", "retry-after");
          res.end(JSON.stringify({ error: "too many requests" }));
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

      void yoga(req, res);
    } catch (error) {
      errorReporter.captureException(error, {
        path: req.url ?? "",
        method: req.method ?? ""
      });
      logger.error({ err: error }, "unhandled request error");
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

  useServer(
    {
      schema: apiSchema,
      context: async (ctx) => {
        const headers = ctx.extra.request.headers;
        const connectionParams = ctx.connectionParams;
        return createContextFromHeaders(
          mergeWebSocketConnectionHeaders(headers, connectionParams),
          logger,
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
        return true;
      }
    },
    wsServer
  );

  return {
    server,
    yoga,
    wsServer
  };
}
