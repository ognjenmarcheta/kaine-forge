import { createChildLogger, type Logger } from "@repo/logger";
import { randomUUID } from "node:crypto";

interface LoggerPluginOptions {
  logger: Logger;
}

export function createLoggerPlugin({ logger }: LoggerPluginOptions) {
  return {
    onRequest({
      request,
      serverContext
    }: {
      request: Request;
      serverContext: Record<string, unknown>;
    }) {
      const requestId = randomUUID();
      const requestLogger = createChildLogger(logger, { requestId });
      const url = new URL(request.url);

      serverContext["requestId"] = requestId;
      serverContext["requestLogger"] = requestLogger;

      requestLogger.info({ method: request.method, path: url.pathname }, "request started");
    },
    onResponse({
      request,
      serverContext
    }: {
      request: Request;
      serverContext: Record<string, unknown>;
    }) {
      const requestLogger = (serverContext["requestLogger"] as Logger | undefined) ?? logger;
      const url = new URL(request.url);

      requestLogger.info({ method: request.method, path: url.pathname }, "request completed");
    }
  };
}
