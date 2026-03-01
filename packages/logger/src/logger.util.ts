import pino from "pino";

import { resolveLoggerConfig } from "./logger.config";
import type { CreateLoggerOptions, Logger } from "./logger.type";

export function createLogger(options: CreateLoggerOptions): Logger {
  const config = resolveLoggerConfig(options);
  const logger = pino(config);

  if (options.bindings) {
    return logger.child(options.bindings);
  }

  return logger;
}

export function createChildLogger(parent: Logger, bindings: Record<string, unknown>): Logger {
  return parent.child(bindings);
}
