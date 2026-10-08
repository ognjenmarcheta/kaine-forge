import type { DeskConfig } from "../contracts";
import type { PipelineNotification } from "../engine/pipeline.types";
import { redactAndBound } from "../log/log.redact";
import type { Exec } from "../ports";

export const NOTIFY_TIMEOUT_MS = 10_000;
const MESSAGE_LIMIT = 1_000;

export interface Notifier {
  /** Start the notify command for a notification. Never throws. */
  readonly notify: (notification: PipelineNotification) => void;
  /** Wait for every started command to end, so the process does not exit under it. */
  readonly settled: () => Promise<void>;
}

export interface NotifierOptions {
  readonly exec: Exec;
  readonly command: DeskConfig["notifyCommand"];
  readonly cwd: string;
  /** Failures go here. A failed notification never stops the pipeline. */
  readonly log: (message: string) => void;
  readonly timeoutMs?: number | undefined;
}

/**
 * The environment of the notify command. It reaches the program as plain
 * variables, so a message with quotes or `$(...)` cannot change the command.
 */
export const notifyEnv = (notification: PipelineNotification): Record<string, string> => ({
  DESK_ISSUE: String(notification.issue),
  DESK_STAGE: notification.stage,
  DESK_KIND: notification.kind,
  DESK_MESSAGE: redactAndBound(notification.message, MESSAGE_LIMIT)
});

/**
 * Replace `{issue}`, `{stage}`, `{kind}` and `{message}` inside each word. For
 * programs that take the text as an argument (`terminal-notifier -message
 * {message}`). The text stays one argv word: no shell reads it.
 */
export const notifyArgv = (
  command: readonly string[],
  notification: PipelineNotification
): string[] => {
  const values: Readonly<Record<string, string>> = {
    "{issue}": String(notification.issue),
    "{stage}": notification.stage,
    "{kind}": notification.kind,
    "{message}": redactAndBound(notification.message, MESSAGE_LIMIT)
  };
  return command.map((word) =>
    word.replace(/\{(?:issue|stage|kind|message)\}/g, (key) => values[key] ?? key)
  );
};

/**
 * Run `notifyCommand` as an argv array with a timeout. There is no shell. A
 * missing command, a non-zero exit, and a timeout are logged and ignored.
 */
export const createNotifier = (options: NotifierOptions): Notifier => {
  const pending = new Set<Promise<void>>();
  const timeoutMs = options.timeoutMs ?? NOTIFY_TIMEOUT_MS;

  const run = async (notification: PipelineNotification, command: readonly string[]) => {
    try {
      const result = await options.exec({
        argv: notifyArgv(command, notification),
        cwd: options.cwd,
        env: notifyEnv(notification),
        timeoutMs
      });
      if (result.timedOut) {
        options.log(`notify command timed out after ${timeoutMs} ms`);
      } else if (result.code !== 0) {
        const detail = redactAndBound(result.stderr.trim(), 200);
        options.log(
          `notify command failed (exit ${result.code ?? "none"})${detail === "" ? "" : `: ${detail}`}`
        );
      }
    } catch (error) {
      options.log(`notify command failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  };

  return {
    notify: (notification) => {
      const command = options.command;
      if (command === undefined) return;
      const task = run(notification, command).finally(() => pending.delete(task));
      pending.add(task);
    },
    settled: async () => {
      await Promise.all([...pending]);
    }
  };
};
