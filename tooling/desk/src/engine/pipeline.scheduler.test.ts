import { describe, expect, it } from "vitest";

import { createScheduler } from "./pipeline.scheduler";

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("createScheduler", () => {
  describe("serial", () => {
    it("runs the tasks of one issue one at a time, in arrival order", async () => {
      const scheduler = createScheduler(2);
      const log: string[] = [];
      const gate = deferred();
      const first = scheduler.serial(1, async () => {
        log.push("first start");
        await gate.promise;
        log.push("first end");
      });
      const second = scheduler.serial(1, () => {
        log.push("second");
        return Promise.resolve();
      });
      await tick();
      expect(log).toEqual(["first start"]);
      expect(scheduler.queued(1)).toBe(2);
      gate.resolve();
      await Promise.all([first, second]);
      expect(log).toEqual(["first start", "first end", "second"]);
      expect(scheduler.queued(1)).toBe(0);
    });

    it("lets different issues run together", async () => {
      const scheduler = createScheduler(2);
      const gate = deferred();
      let running = 0;
      let peak = 0;
      const task = async () => {
        running += 1;
        peak = Math.max(peak, running);
        await gate.promise;
        running -= 1;
      };
      const all = Promise.all([scheduler.serial(1, task), scheduler.serial(2, task)]);
      await tick();
      expect(peak).toBe(2);
      gate.resolve();
      await all;
    });

    it("runs the next task after one that threw, and returns the error to its caller", async () => {
      const scheduler = createScheduler(1);
      const failing = scheduler.serial(1, () => Promise.reject(new Error("boom")));
      const next = scheduler.serial(1, () => Promise.resolve("ran"));
      await expect(failing).rejects.toThrow("boom");
      await expect(next).resolves.toBe("ran");
    });
  });

  describe("agent slots", () => {
    it("never runs more agents than maxConcurrentAgents", async () => {
      const scheduler = createScheduler(1);
      const gate = deferred();
      let running = 0;
      let peak = 0;
      const agent = () =>
        scheduler.agent.run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await gate.promise;
          running -= 1;
        });
      const all = Promise.all([agent(), agent(), agent()]);
      await tick();
      expect(running).toBe(1);
      expect(scheduler.agent.waiting()).toBe(2);
      gate.resolve();
      await all;
      expect(peak).toBe(1);
      expect(scheduler.agent.active()).toBe(0);
    });
  });

  describe("check slot", () => {
    it("has exactly one slot, whatever the agent limit", async () => {
      const scheduler = createScheduler(5);
      const gate = deferred();
      let running = 0;
      let peak = 0;
      const check = () =>
        scheduler.check.run(async () => {
          running += 1;
          peak = Math.max(peak, running);
          await gate.promise;
          running -= 1;
        });
      const all = Promise.all([check(), check()]);
      await tick();
      expect(running).toBe(1);
      gate.resolve();
      await all;
      expect(peak).toBe(1);
    });

    it("does not use an agent slot", async () => {
      const scheduler = createScheduler(1);
      const gate = deferred();
      const agent = scheduler.agent.run(() => gate.promise);
      await tick();
      await expect(scheduler.check.run(() => Promise.resolve("checked"))).resolves.toBe("checked");
      gate.resolve();
      await agent;
    });
  });
});
