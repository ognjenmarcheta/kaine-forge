import type { AgentEvent } from "./agent.runner";

/** Identical failing tool calls in a row that stop a run. */
export const STUCK_LIMIT = 8;

export interface StuckDetector {
  /** Feed every event of a run in order. Returns the stop reason once, when the run is stuck. */
  readonly observe: (event: AgentEvent) => string | null;
}

interface Call {
  readonly key: string;
  readonly label: string;
}

const isFailure = (event: Extract<AgentEvent, { type: "tool_result" }>): boolean =>
  event.isError ||
  (event.exitCode !== undefined && event.exitCode !== null && event.exitCode !== 0);

/**
 * Watches one agent run for a loop: the same tool with the same command and paths,
 * failing again and again. Any other call that completes, or a success, resets the
 * streak. A call the permission rules denied never counts: the desk reports denials
 * on their own, and a denial that arrives only after the result is rare.
 */
export const createStuckDetector = (limit: number = STUCK_LIMIT): StuckDetector => {
  const pending = new Map<string, Call>();
  const denied = new Set<string>();
  let streak: Call | null = null;
  let count = 0;
  let tripped = false;

  return {
    observe: (event) => {
      if (tripped) return null;
      if (event.type === "tool_call") {
        pending.set(event.id, {
          key: JSON.stringify([event.tool, event.command ?? null, event.paths]),
          label: event.command ?? [event.tool, ...event.paths].join(" ")
        });
        return null;
      }
      if (event.type === "denial") {
        if (event.denial.toolUseId !== undefined) denied.add(event.denial.toolUseId);
        return null;
      }
      if (event.type !== "tool_result") return null;

      const call = pending.get(event.id);
      pending.delete(event.id);
      if (call === undefined || denied.has(event.id)) return null;
      if (!isFailure(event)) {
        streak = null;
        count = 0;
        return null;
      }
      if (streak?.key === call.key) {
        count += 1;
      } else {
        streak = call;
        count = 1;
      }
      if (count < limit) return null;
      tripped = true;
      return `The agent ran \`${call.label.slice(0, 200)}\` ${count} times in a row and it failed each time. The desk stopped the run.`;
    }
  };
};
