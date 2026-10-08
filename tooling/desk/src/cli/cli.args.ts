import { parseArgs, type ParseArgsConfig } from "node:util";

import { UsageError } from "./cli.types";

export const parseIssueNumber = (value: string | undefined): number => {
  const match = /^#?([1-9]\d*)$/.exec(value ?? "");
  if (!match) throw new UsageError(`Expected an issue number, got '${value ?? ""}'.`);
  return Number(match[1]);
};

type OptionConfig = NonNullable<ParseArgsConfig["options"]>;

/** Strict `parseArgs`. A bad flag becomes a `UsageError`, so the CLI exits 2. */
export const parse = <T extends OptionConfig>(args: string[], options: T) => {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "Invalid arguments.");
  }
};

/** The one issue number a command takes, with the usage line for errors. */
export const requireIssue = (positionals: readonly string[], usage: string): number => {
  if (positionals.length !== 1) throw new UsageError(`Usage: ${usage}`);
  return parseIssueNumber(positionals[0]);
};
