import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { issueStateSchema, issueStateV1Schema, type IssueState } from "../contracts";
import { createIssueStore } from "./store.issue";
import { builtinFlowSnapshot } from "../registry/registry.snapshot";
import { DEFAULT_SNAPSHOT } from "../testing/flow.testing";

const state = (issueNumber: number, over: Partial<IssueState> = {}): IssueState => ({
  schemaVersion: 2,
  flowSnapshot: DEFAULT_SNAPSHOT,
  issueNumber,
  stage: "intake",
  status: "idle",
  resumeStage: null,
  branch: null,
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history: [],
  authorization: null,
  createdAt: "2026-10-07T09:00:00Z",
  updatedAt: "2026-10-07T09:00:00Z",
  ...over
});

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-store-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("issue store", () => {
  it("lays out one directory per issue under <root>/issues/<n>", () => {
    const store = createIssueStore(root);
    const dir = path.join(root, "issues", "42");
    expect(store.issueDir(42)).toBe(dir);
    expect(store.statePath(42)).toBe(path.join(dir, "state.json"));
    expect(store.eventsPath(42)).toBe(path.join(dir, "events.jsonl"));
    expect(store.artifactsDir(42)).toBe(path.join(dir, "artifacts"));
    expect(store.leasePath(42)).toBe(path.join(dir, "lease.json"));
  });

  it("writes and reads state, and creates the artifacts directory", async () => {
    const store = createIssueStore(root);
    await store.write(state(7, { stage: "plan", status: "running" }));
    expect(await store.read(7)).toEqual({
      status: "ok",
      state: state(7, { stage: "plan", status: "running" })
    });
    expect((await stat(store.artifactsDir(7))).isDirectory()).toBe(true);
  });

  it("reports a missing issue as missing, not unreadable", async () => {
    expect(await createIssueStore(root).read(99)).toEqual({ status: "missing" });
  });

  it("refuses to write a state that breaks the contract", async () => {
    const store = createIssueStore(root);
    await expect(
      store.write(state(1, { stage: "bogus" as IssueState["stage"] }))
    ).rejects.toThrow();
    expect(await store.read(1)).toEqual({ status: "missing" });
  });

  it("rejects invalid issue numbers", () => {
    const store = createIssueStore(root);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => store.issueDir(bad)).toThrow(RangeError);
    }
  });

  describe("unreadable state never throws", () => {
    const plant = async (issueNumber: number, content: string) => {
      const store = createIssueStore(root);
      await mkdir(store.issueDir(issueNumber), { recursive: true });
      await writeFile(store.statePath(issueNumber), content);
      return store;
    };

    it("reports truncated or corrupt JSON", async () => {
      const store = await plant(3, '{"schemaVersion": 1, "issueNu');
      expect(await store.read(3)).toMatchObject({ status: "unreadable", reason: "invalid-json" });
    });

    it("reports an unknown schema version", async () => {
      const store = await plant(4, JSON.stringify({ ...state(4), schemaVersion: 3 }));
      expect(await store.read(4)).toMatchObject({
        status: "unreadable",
        reason: "unknown-schema-version"
      });
    });

    it("reports content that breaks the contract", async () => {
      const store = await plant(5, JSON.stringify({ ...state(5), stage: "bogus" }));
      const result = await store.read(5);
      expect(result).toMatchObject({ status: "unreadable", reason: "invalid-schema" });
      expect(result.status === "unreadable" && result.detail).toContain("stage");
    });

    it("reports valid JSON that is not an object", async () => {
      const store = await plant(6, "null");
      expect(await store.read(6)).toMatchObject({ status: "unreadable" });
    });

    it("reports a state filed under the wrong issue number", async () => {
      const store = await plant(8, JSON.stringify(state(9)));
      expect(await store.read(8)).toMatchObject({ status: "unreadable", reason: "invalid-schema" });
    });

    it("reports an IO error such as state.json being a directory", async () => {
      const store = createIssueStore(root);
      await mkdir(store.statePath(10), { recursive: true });
      expect(await store.read(10)).toMatchObject({ status: "unreadable", reason: "io-error" });
    });
  });

  describe("list", () => {
    it("returns nothing when the store is empty", async () => {
      expect(await createIssueStore(root).list()).toEqual([]);
    });

    it("lists issues in numeric order and isolates one corrupt issue", async () => {
      const store = createIssueStore(root);
      await store.write(state(10));
      await store.write(state(2));
      await mkdir(store.issueDir(5), { recursive: true });
      await writeFile(store.statePath(5), "{ not json");
      await mkdir(path.join(root, "issues", "notes"), { recursive: true });
      await writeFile(path.join(root, "issues", "README"), "ignored");

      const entries = await store.list();
      expect(entries.map((entry) => entry.issueNumber)).toEqual([2, 5, 10]);
      expect(entries.map((entry) => entry.result.status)).toEqual(["ok", "unreadable", "ok"]);
    });
  });

  describe("a version 1 state file", () => {
    /** A state file as the desk wrote it before flow snapshots, planted under `issueNumber`. */
    const plantV1 = async (
      name: string
    ): Promise<{ readonly raw: string; readonly json: unknown }> => {
      const raw = await readFile(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");
      const json: unknown = JSON.parse(raw);
      const issueNumber = issueStateV1Schema.parse(json).issueNumber;
      const store = createIssueStore(root);
      await mkdir(store.issueDir(issueNumber), { recursive: true });
      await writeFile(store.statePath(issueNumber), raw);
      return { raw, json };
    };

    it.each(["state.v1.needs-you.json", "state.v1.pr-open.json"])(
      "reads %s on the built-in default flow with every field kept",
      async (name) => {
        const { json } = await plantV1(name);
        const v1 = issueStateV1Schema.parse(json);
        const read = await createIssueStore(root).read(v1.issueNumber);
        // Step ids are the old stage names, loop steps the old counters, agent ids the old roles.
        expect(read).toEqual({
          status: "ok",
          state: { ...v1, schemaVersion: 2, flowSnapshot: await builtinFlowSnapshot() }
        });
      }
    );

    it("stays version 1 on disk until the next write stores version 2", async () => {
      const { raw } = await plantV1("state.v1.needs-you.json");
      const store = createIssueStore(root);
      const read = await store.read(41);
      if (read.status !== "ok") throw new Error(`state is ${read.status}`);
      expect(await readFile(store.statePath(41), "utf8")).toBe(raw);

      await store.write(read.state);
      const written: unknown = JSON.parse(await readFile(store.statePath(41), "utf8"));
      expect(issueStateSchema.parse(written)).toEqual(read.state);
      expect(await store.read(41)).toEqual(read);
    });
  });

  it("appends validated events as JSON lines", async () => {
    const store = createIssueStore(root);
    await store.appendEvent(7, { at: "2026-10-07T09:00:00Z", stage: "plan", event: "start" });
    await store.appendEvent(7, {
      at: "2026-10-07T09:01:00Z",
      stage: "plan",
      event: "complete",
      note: "done"
    });
    const lines = (await readFile(store.eventsPath(7), "utf8")).trim().split("\n");
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { at: "2026-10-07T09:00:00Z", stage: "plan", event: "start" },
      { at: "2026-10-07T09:01:00Z", stage: "plan", event: "complete", note: "done" }
    ]);
    await expect(
      store.appendEvent(7, { at: "not a date", stage: "plan", event: "x" })
    ).rejects.toThrow();
  });
});
