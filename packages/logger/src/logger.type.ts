import type pino from "pino";

import { LOG_LEVELS } from "./logger.definition";

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
  environment?: string;
  prettyPrint?: boolean;
  bindings?: Record<string, unknown>;
}

export type Logger = pino.Logger;
