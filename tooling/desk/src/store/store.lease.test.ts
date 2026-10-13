import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireLease, type LeaseDeps } from "./store.lease";

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "desk-lease-"));
  file = path.join(dir, "issues", "1", "lease.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A process table the test controls. */
const processes = (alive: Record<number, string | null>): Partial<LeaseDeps> => ({
  isProcessAlive: (pid) => pid in alive,
  processStart: async (pid) => alive[pid] ?? null
});

const as = (pid: number, table: Record<number, string | null>): Partial<LeaseDeps> => ({
  pid,
  ...processes(table)
});

describe("acquireLease", () => {
  it("acquires a free lease and records pid, start time, and a token", async () => {
    const result = await acquireLease(file, as(100, { 100: "Mon Oct 5 10:00:00 2026" }));
    expect(result.status).toBe("acquired");
    const onDisk: unknown = JSON.parse(await readFile(file, "utf8"));
    expect(onDisk).toMatchObject({ pid: 100, processStart: "Mon Oct 5 10:00:00 2026" });
    expect(onDisk).toHaveProperty("token");
    expect(onDisk).toHaveProperty("acquiredAt");
  });

  it("refuses a second holder while the first process is alive", async () => {
    const table = { 100: "t1", 200: "t2" };
    await acquireLease(file, as(100, table));
    const second = await acquireLease(file, as(200, table));
    expect(second).toMatchObject({ status: "held", holder: { pid: 100 } });
  });

  it("lets exactly one of many concurrent contenders win", async () => {
    const table = Object.fromEntries(Array.from({ length: 8 }, (_v, i) => [100 + i, `t${i}`]));
    const results = await Promise.all(
      Array.from({ length: 8 }, (_v, i) => acquireLease(file, as(100 + i, table)))
    );
    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(await readdir(path.dirname(file))).toEqual(["lease.json"]);
  });

  it("takes over a lease whose process is gone", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    const takeover = await acquireLease(file, as(200, { 200: "t2" }));
    expect(takeover.status).toBe("acquired");
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ pid: 200 });
  });

  it("takes over when the pid was reused by a process with a different start time", async () => {
    await acquireLease(file, as(100, { 100: "original start" }));
    const takeover = await acquireLease(file, as(200, { 100: "reused start", 200: "t2" }));
    expect(takeover.status).toBe("acquired");
  });

  it("keeps the lease when ps cannot report the holder's start time", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    const second = await acquireLease(file, {
      pid: 200,
      isProcessAlive: () => true,
      processStart: async () => null
    });
    expect(second.status).toBe("held");
  });

  it("falls back to the pid alone when the holder recorded no start time", async () => {
    await acquireLease(file, { pid: 100, ...processes({ 100: null }) });
    const second = await acquireLease(file, as(200, { 100: "anything", 200: "t2" }));
    expect(second.status).toBe("held");
  });

  it("treats a corrupt lease file as stale", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    await writeFile(file, "garbage");
    expect((await acquireLease(file, as(200, { 200: "t2" }))).status).toBe("acquired");
  });

  it("lets only one of many contenders take over a stale lease", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    const table = Object.fromEntries(Array.from({ length: 8 }, (_v, i) => [200 + i, `t${i}`]));
    const results = await Promise.all(
      Array.from({ length: 8 }, (_v, i) => acquireLease(file, as(200 + i, table)))
    );
    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect((await readdir(path.dirname(file))).sort()).toEqual(["lease.json"]);
  });

  it("clears a takeover lock left by a process that died mid-takeover", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    const lock = `${file}.takeover`;
    await writeFile(lock, "");
    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);

    const table = { 200: "t2" };
    // The first attempt only clears the dead lock; the next one takes over.
    await acquireLease(file, as(200, table));
    const retry = await acquireLease(file, as(200, table));
    expect(retry.status).toBe("acquired");
  });

  it("defers to a fresh takeover lock", async () => {
    await acquireLease(file, as(100, { 100: "t1" }));
    await writeFile(`${file}.takeover`, "");
    expect((await acquireLease(file, as(200, { 200: "t2" }))).status).toBe("held");
  });
});

describe("release", () => {
  it("frees the lease for the next holder", async () => {
    const table = { 100: "t1", 200: "t2" };
    const first = await acquireLease(file, as(100, table));
    if (first.status !== "acquired") throw new Error("expected the lease");
    await first.lease.release();
    expect((await acquireLease(file, as(200, table))).status).toBe("acquired");
  });

  it("is idempotent", async () => {
    const first = await acquireLease(file, as(100, { 100: "t1" }));
    if (first.status !== "acquired") throw new Error("expected the lease");
    await first.lease.release();
    await expect(first.lease.release()).resolves.toBeUndefined();
  });

  it("does not delete a lease that another process took over", async () => {
    const first = await acquireLease(file, as(100, { 100: "t1" }));
    if (first.status !== "acquired") throw new Error("expected the lease");
    const second = await acquireLease(file, as(200, { 200: "t2" }));
    expect(second.status).toBe("acquired");

    await first.lease.release();
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ pid: 200 });
  });
});

describe("with the real process table", () => {
  it("holds the lease against this live process and frees it on release", async () => {
    const first = await acquireLease(file);
    if (first.status !== "acquired") throw new Error("expected the lease");
    expect(await acquireLease(file)).toMatchObject({
      status: "held",
      holder: { pid: process.pid }
    });
    await first.lease.release();
    expect((await acquireLease(file)).status).toBe("acquired");
  });
});
