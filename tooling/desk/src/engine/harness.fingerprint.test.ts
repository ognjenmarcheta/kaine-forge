import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { harnessFingerprint } from "./harness.fingerprint";

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const HEAD = "a".repeat(40);

describe("harnessFingerprint", () => {
  it("makes the flow snapshot, which holds custom agent prompts, part of the desk hash", async () => {
    const checkout = await mkdtemp(path.join(tmpdir(), "desk-harness-"));
    dirs.push(checkout);
    const rules = path.join(checkout, "rules.md");
    await writeFile(rules, "# Rules\n");
    const desk = async (flowHash: string | null) =>
      (await harnessFingerprint(checkout, [rules], () => Promise.resolve(HEAD), flowHash)).desk;

    const one = await desk("1".repeat(64));
    expect(await desk("1".repeat(64))).toBe(one);
    expect(await desk("2".repeat(64))).not.toBe(one);
    // A run of no flow agent (the intake draft) keeps the hash of the desk files alone.
    expect(await desk(null)).not.toBe(one);
  });
});
