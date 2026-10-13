/**
 * A counting semaphore with a FIFO queue. `createSlots(n)` bounds how many
 * tasks run at once: the engine uses one for agents (`maxConcurrentAgents`)
 * and `createSlots(1)` as the single `check` slot.
 */
export interface Slots {
  /** Wait for a free slot. Call the returned function once to give it back. */
  readonly acquire: () => Promise<() => void>;
  /** Run `task` in a slot. The slot is released when it returns or throws. */
  readonly run: <T>(task: () => Promise<T> | T) => Promise<T>;
  /** Slots in use now. */
  readonly active: () => number;
  /** Callers waiting for a slot. */
  readonly waiting: () => number;
}

export const createSlots = (size: number): Slots => {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`Slot count must be a positive integer, got ${size}`);
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const makeRelease = (): (() => void) => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // Hand the slot straight to the next waiter so a newcomer cannot jump the queue.
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    };
  };

  const acquire = (): Promise<() => void> => {
    if (active < size) {
      active += 1;
      return Promise.resolve(makeRelease());
    }
    return new Promise((resolve) => {
      queue.push(() => resolve(makeRelease()));
    });
  };

  return {
    acquire,
    run: async (task) => {
      const release = await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    active: () => active,
    waiting: () => queue.length
  };
};
