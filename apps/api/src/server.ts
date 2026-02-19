import { createServerAuth } from "@repo/auth";
import { createYoga } from "graphql-yoga";
import { createServer } from "node:http";

import { createContext } from "./context";
import { handleAuthRoute } from "./features/auth/auth.router";
import { formatApiError } from "./middleware/error.middleware";
import { loggerPlugin } from "./plugins/logger.plugin";
import { apiSchema } from "./schema";
import { createDepthLimitPlugin, resolveApiRuntimeConfig } from "./server.config";

export function createApiServer() {
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
    plugins: [loggerPlugin, createDepthLimitPlugin(runtimeConfig.maxQueryDepth)],
    context: async ({ request }) => createContext(request),
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

  return {
    server,
    yoga
  };
}
