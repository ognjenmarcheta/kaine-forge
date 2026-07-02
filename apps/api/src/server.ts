import { createServerAuth } from "@repo/auth/server";
import type { Logger } from "@repo/logger";
import { useServer } from "graphql-ws/use/ws";
import { createYoga } from "graphql-yoga";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { createContext, createContextFromHeaders } from "./context";
import { handleAuthRoute } from "./features/auth/auth.router";
import { handleHealthRoute } from "./features/health/health.router";
import { formatApiError } from "./middleware/error.middleware";
import {
  createRateLimiter,
  resolveRateLimitConfig,
  resolveRateLimitKey
} from "./middleware/rate-limit.middleware";
import { createLoggerPlugin } from "./plugins/logger.plugin";
import { apiSchema } from "./schema";
import { createDepthLimitPlugin, resolveApiRuntimeConfig } from "./server.config";

interface CreateApiServerOptions {
  logger: Logger;
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

export function createApiServer({ logger }: CreateApiServerOptions) {
  const auth = createServerAuth();
  const runtimeConfig = resolveApiRuntimeConfig(process.env);
  const rateLimiter = createRateLimiter(resolveRateLimitConfig(process.env));
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
    plugins: [createLoggerPlugin({ logger }), createDepthLimitPlugin(runtimeConfig.maxQueryDepth)],
    context: async (initialContext) => {
      const serverContext = initialContext as unknown as Record<string, unknown>;
      const requestLogger = (serverContext["requestLogger"] as Logger | undefined) ?? logger;

      const nodeHeaders = (initialContext as { req?: { headers?: IncomingHttpHeaders } }).req
        ?.headers;
      if (nodeHeaders) {
        return createContextFromHeaders(nodeHeaders, requestLogger, auth);
      }

      return createContext(initialContext.request, requestLogger, auth);
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

  const server = createServer(async (req, res) => {
    try {
      const handledHealth = await handleHealthRoute({ req, res });

      if (handledHealth) {
        return;
      }

      // Rate limit auth and GraphQL traffic only; health probes dispatched
      // above stay unthrottled.
      const pathname = (req.url ?? "").split("?")[0] ?? "";

      if (pathname.startsWith("/api/auth") || pathname === "/graphql") {
        const decision = rateLimiter.check(resolveRateLimitKey(req));

        if (!decision.allowed) {
          res.statusCode = 429;
          res.setHeader("content-type", "application/json");
          res.setHeader("retry-after", String(decision.retryAfterSeconds));
          res.end(JSON.stringify({ error: "too many requests" }));
          return;
        }
      }

      const handledAuth = await handleAuthRoute({
        req,
        res,
        auth
      });

      if (handledAuth) {
        return;
      }

      yoga(req, res);
    } catch (error) {
      const normalized = formatApiError(error, {
        exposeDetails: runtimeConfig.exposeErrorDetails
      });
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(normalized));
    }
  });

  const wsServer = new WebSocketServer({ server, path: "/graphql" });

  useServer(
    {
      schema: apiSchema,
      context: async (ctx) => {
        const req = ctx.extra.request as IncomingMessage;
        const headers = req.headers;
        const connectionParams = ctx.connectionParams as Record<string, unknown> | undefined;
        return createContextFromHeaders(
          mergeWebSocketConnectionHeaders(headers, connectionParams),
          logger,
          auth
        );
      },
      onConnect: async (ctx) => {
        const req = ctx.extra.request as IncomingMessage;
        const headers = req.headers;
        const connectionParams = ctx.connectionParams as Record<string, unknown> | undefined;
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
