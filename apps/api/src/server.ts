import { createServerAuth } from "@repo/auth/server";
import type { Logger } from "@repo/logger";
import { useServer } from "graphql-ws/use/ws";
import { createYoga } from "graphql-yoga";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { createContext, createContextFromHeaders } from "./context";
import { handleAuthRoute } from "./features/auth/auth.router";
import { formatApiError } from "./middleware/error.middleware";
import { createLoggerPlugin } from "./plugins/logger.plugin";
import { apiSchema } from "./schema";
import { createDepthLimitPlugin, resolveApiRuntimeConfig } from "./server.config";

interface CreateApiServerOptions {
  logger: Logger;
}

export function createApiServer({ logger }: CreateApiServerOptions) {
  const auth = createServerAuth();
  const runtimeConfig = resolveApiRuntimeConfig(process.env);
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
        return createContextFromHeaders(nodeHeaders, requestLogger);
      }

      return createContext(initialContext.request, requestLogger);
    },
    maskedErrors: runtimeConfig.maskedErrors,
    cors
  });

  const server = createServer(async (req, res) => {
    try {
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
        const connectionParams = ctx.connectionParams as Record<string, string> | undefined;

        if (connectionParams) {
          const mergedHeaders: IncomingHttpHeaders = { ...headers };
          for (const [key, value] of Object.entries(connectionParams)) {
            if (typeof value === "string") {
              mergedHeaders[key.toLowerCase()] = value;
            }
          }
          return createContextFromHeaders(mergedHeaders, logger);
        }

        return createContextFromHeaders(headers, logger);
      },
      onConnect: async (ctx) => {
        const req = ctx.extra.request as IncomingMessage;
        const headers = req.headers;
        const connectionParams = ctx.connectionParams as Record<string, string> | undefined;

        const mergedHeaders: IncomingHttpHeaders = { ...headers };
        if (connectionParams) {
          for (const [key, value] of Object.entries(connectionParams)) {
            if (typeof value === "string") {
              mergedHeaders[key.toLowerCase()] = value;
            }
          }
        }

        const authInstance = createServerAuth();
        const session = await authInstance.getSessionFromHeaders(mergedHeaders);
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
