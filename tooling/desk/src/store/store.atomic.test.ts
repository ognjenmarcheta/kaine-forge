import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendJsonl, writeJsonAtomic } from "./store.atomic";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "desk-atomic-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  it("creates missing parent directories and writes readable JSON", async () => {
    const file = path.join(dir, "a", "b", "state.json");
    await writeJsonAtomic(file, { n: 1 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ n: 1 });
  });

  it("replaces the old content and leaves no temp file behind", async () => {
    const file = path.join(dir, "state.json");
    await writeJsonAtomic(file, { n: 1 });
    await writeJsonAtomic(file, { n: 2 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ n: 2 });
    expect(await readdir(dir)).toEqual(["state.json"]);
  });

  it("keeps the old file and cleans up when the write fails", async () => {
    const file = path.join(dir, "state.json");
    await writeJsonAtomic(file, { n: 1 });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(writeJsonAtomic(file, cyclic)).rejects.toThrow();
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ n: 1 });
    expect(await readdir(dir)).toEqual(["state.json"]);
  });

  it("never exposes a partial file to concurrent readers", async () => {
    const file = path.join(dir, "state.json");
    await writeJsonAtomic(file, { payload: "x".repeat(10) });
    const big = { payload: "y".repeat(200_000) };
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
        expect(parsed).toBeTruthy();
      }
    })();
    for (let i = 0; i < 20; i += 1) await writeJsonAtomic(file, big);
    stop = true;
    await reader;
  });
});

describe("appendJsonl", () => {
  it("appends one parseable line per record in order", async () => {
    const file = path.join(dir, "nested", "events.jsonl");
    await appendJsonl(file, { i: 1 });
    await appendJsonl(file, { i: 2, text: "line\nbreak" });
    const lines = (await readFile(file, "utf8")).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { i: 1 },
      { i: 2, text: "line\nbreak" }
    ]);
  });

  it("appends to an existing file", async () => {
    const file = path.join(dir, "events.jsonl");
    await writeFile(file, '{"i":0}\n');
    await appendJsonl(file, { i: 1 });
    expect((await readFile(file, "utf8")).trim().split("\n")).toHaveLength(2);
  });
});
