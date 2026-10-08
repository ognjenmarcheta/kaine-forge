import { describe, expect, it } from "vitest";

import { createSlots } from "./check.concurrency";

const gate = () => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("createSlots", () => {
  it("never runs more tasks than there are slots", async () => {
    const slots = createSlots(2);
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, gate);
    const done = gates.map((g) =>
      slots.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await g.promise;
        running -= 1;
      })
    );
    await tick();
    expect(running).toBe(2);
    expect(slots.active()).toBe(2);
    expect(slots.waiting()).toBe(3);
    for (const g of gates) {
      g.open();
      await tick();
    }
    await Promise.all(done);
    expect(peak).toBe(2);
    expect(slots.active()).toBe(0);
    expect(slots.waiting()).toBe(0);
  });

  it("serves waiters in the order they asked", async () => {
    const slots = createSlots(1);
    const order: number[] = [];
    const first = gate();
    const all = [
      slots.run(async () => {
        await first.promise;
        order.push(0);
      }),
      ...[1, 2, 3].map((n) => slots.run(() => void order.push(n)))
    ];
    await tick();
    expect(order).toEqual([]);
    first.open();
    await Promise.all(all);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("releases the slot when a task throws", async () => {
    const slots = createSlots(1);
    await expect(
      slots.run(() => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(slots.run(() => "next")).resolves.toBe("next");
    expect(slots.active()).toBe(0);
  });

  it("lets a waiter proceed after a failure", async () => {
    const slots = createSlots(1);
    const first = gate();
    const failing = slots.run(async () => {
      await first.promise;
      throw new Error("late failure");
    });
    const next = slots.run(() => "ran");
    first.open();
    await expect(failing).rejects.toThrow("late failure");
    await expect(next).resolves.toBe("ran");
  });

  it("ignores a second release of the same slot", async () => {
    const slots = createSlots(1);
    const release = await slots.acquire();
    release();
    release();
    expect(slots.active()).toBe(0);
    const a = await slots.acquire();
    let second = false;
    void slots.acquire().then(() => {
      second = true;
    });
    await tick();
    expect(second).toBe(false);
    a();
    await tick();
    expect(second).toBe(true);
  });

  it("does not let a newcomer jump the queue when a slot frees", async () => {
    const slots = createSlots(1);
    const release = await slots.acquire();
    const order: string[] = [];
    const queued = slots.acquire().then((r) => {
      order.push("queued");
      return r;
    });
    release();
    const newcomer = slots.acquire().then((r) => {
      order.push("newcomer");
      return r;
    });
    (await queued)();
    (await newcomer)();
    expect(order).toEqual(["queued", "newcomer"]);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects the size %s", (size) => {
    expect(() => createSlots(size)).toThrow(RangeError);
  });
});
