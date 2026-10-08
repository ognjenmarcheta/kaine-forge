import { createSlots, type Slots } from "../check/check.concurrency";

/**
 * Concurrency rules of the desk, in one place:
 *
 * - One issue never runs two actions at once. Actions for an issue queue in
 *   the order they arrive (`serial`).
 * - At most `maxConcurrentAgents` agent processes run at a time, across all
 *   issues. A slot is held only while the process runs, never at a gate.
 * - One `check` runs at a time. Checks are heavy and share the machine.
 */
export interface Scheduler {
  /** Run `task` after every earlier task of the same issue has settled. A failure does not block later tasks. */
  readonly serial: <T>(issue: number, task: () => Promise<T>) => Promise<T>;
  /** Tasks of `issue` that wait or run now. */
  readonly queued: (issue: number) => number;
  readonly agent: Slots;
  readonly check: Slots;
}

export const createScheduler = (maxConcurrentAgents: number): Scheduler => {
  const tails = new Map<number, Promise<unknown>>();
  const counts = new Map<number, number>();

  return {
    agent: createSlots(maxConcurrentAgents),
    check: createSlots(1),
    queued: (issue) => counts.get(issue) ?? 0,
    serial: <T>(issue: number, task: () => Promise<T>): Promise<T> => {
      const before = tails.get(issue) ?? Promise.resolve();
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
      const run = before.then(task, task);
      const settled = run.then(
        () => undefined,
        () => undefined
      );
      tails.set(issue, settled);
      void settled.then(() => {
        const left = (counts.get(issue) ?? 1) - 1;
        if (left <= 0) {
          counts.delete(issue);
          // Drop the tail only when no later task chained after it.
          if (tails.get(issue) === settled) tails.delete(issue);
        } else {
          counts.set(issue, left);
        }
      });
      return run;
    }
  };
};
