import type { LoggerOptions } from "pino";

import { DEFAULT_LOG_LEVEL, LOG_LEVEL_ENV_KEY, LOG_LEVELS } from "./logger.definition";
import type { CreateLoggerOptions, LogLevel } from "./logger.type";

function isValidLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}

function resolveLogLevel(explicit?: LogLevel): LogLevel {
  if (explicit) {
    return explicit;
  }

  const envValue = process.env[LOG_LEVEL_ENV_KEY];

  if (envValue && isValidLogLevel(envValue)) {
    return envValue;
  }

  const nodeEnv = process.env["NODE_ENV"];

  if (nodeEnv === "test") {
    return "silent";
  }

  return DEFAULT_LOG_LEVEL;
}

export function resolveLoggerConfig(options: CreateLoggerOptions): LoggerOptions {
  const level = resolveLogLevel(options.level);
  const environment = options.environment ?? process.env["NODE_ENV"] ?? "development";
  const isBrowser = "window" in globalThis;

  if (isBrowser) {
    return {
      name: options.name,
      level,
      browser: { asObject: true }
    };
  }

  const isDevelopment = environment === "development";
  const usePretty = options.prettyPrint ?? isDevelopment;

  const config: LoggerOptions = {
    name: options.name,
    level
  };

  if (usePretty) {
    config.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l"
      }
    };
  }

  return config;
}
