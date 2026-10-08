import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { issueStateSchema } from "../contracts";
import { followLog, readLogLines } from "./log.read";
import { MAX_FIELD_CHARS, parseLogLine, toLogRecord } from "./log.record";
import { ROTATED_LOG_NAME, agentLogPath, createLogSink } from "./log.writer";
import type { PipelineEvent } from "../engine/pipeline.types";
import { createIssueStore, type IssueStore } from "../store/store.issue";

const NOW = new Date("2026-10-07T09:00:00Z");

let root: string;
let store: IssueStore;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-log-"));
  store = createIssueStore(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const sink = (maxBytes?: number) => createLogSink({ store, clock: { now: () => NOW }, maxBytes });

const logEvent = (message: string, issue = 7): PipelineEvent => ({ type: "log", issue, message });
const read = async (): Promise<string[]> =>
  (await readFile(agentLogPath(store, 7), "utf8")).trim().split("\n");

describe("toLogRecord", () => {
  it("keeps history, log, and agent events, and drops state events", () => {
    expect(
      toLogRecord(
        {
          type: "history",
          issue: 7,
          event: { at: "2026-10-07T08:00:00.000Z", stage: "plan", event: "stage-started" }
        },
        NOW
      )
    ).toMatchObject({ kind: "history", at: "2026-10-07T08:00:00.000Z", stage: "plan" });
    expect(toLogRecord(logEvent("hello"), NOW)).toMatchObject({
      kind: "log",
      at: NOW.toISOString(),
      message: "hello"
    });
    expect(
      toLogRecord(
        { type: "agent", issue: 7, role: "builder", event: { type: "text", text: "hi" } },
        NOW
      )
    ).toMatchObject({ kind: "agent", role: "builder", type: "text", text: "hi" });
    const state = issueStateSchema.parse({
      schemaVersion: 1,
      issueNumber: 7,
      stage: "plan",
      status: "running",
      resumeStage: null,
      branch: null,
      worktreePath: null,
      sessions: {},
      loops: { check: 0, review: 0 },
      lastCheckFingerprint: null,
      history: [],
      authorization: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    });
    expect(toLogRecord({ type: "state", issue: 7, state }, NOW)).toBeNull();
  });

  it("redacts every text field of an agent event, denials included", () => {
    const secret = "sk-ant-api03-SECRETSECRET";
    const record = toLogRecord(
      {
        type: "agent",
        issue: 7,
        role: "builder",
        event: {
          type: "denial",
          denial: { tool: "Bash", command: `curl -H "Bearer ${secret}"`, paths: [`/x/${secret}`] }
        }
      },
      NOW
    );
    expect(JSON.stringify(record)).not.toContain("SECRETSECRET");
  });

  it("cuts a long field and marks the cut", () => {
    const record = toLogRecord(
      {
        type: "agent",
        issue: 7,
        role: "builder",
        event: { type: "text", text: "x".repeat(9_000) }
      },
      NOW
    );
    const text = record?.kind === "agent" ? (record.text ?? "") : "";
    expect(text.length).toBeLessThan(MAX_FIELD_CHARS + 20);
    expect(text.endsWith("...[truncated]")).toBe(true);
  });
});

describe("createLogSink", () => {
  it("appends one valid record per line, in order, and flush waits for the writes", async () => {
    const log = sink();
    for (const message of ["one", "two", "three"]) log.write(logEvent(message));
    await log.flush();
    const lines = await read();
    expect(lines.map((line) => parseLogLine(line)?.kind)).toEqual(["log", "log", "log"]);
    expect(lines.map((line) => (JSON.parse(line) as { message: string }).message)).toEqual([
      "one",
      "two",
      "three"
    ]);
    expect(log.failure()).toBeNull();
  });

  it("writes one file per issue and none for desk-wide messages (issue 0)", async () => {
    const log = sink();
    log.write(logEvent("global", 0));
    log.write(logEvent("seven", 7));
    log.write(logEvent("eight", 8));
    await log.flush();
    expect(await read()).toHaveLength(1);
    await expect(stat(path.join(store.issueDir(8), "agent.log.jsonl"))).resolves.toBeTruthy();
    await expect(stat(path.join(root, "issues", "0"))).rejects.toThrow();
  });

  it("rotates when the file would pass the limit, notes it, and keeps one older file", async () => {
    const log = sink(600);
    for (let index = 0; index < 12; index += 1)
      log.write(logEvent(`message ${index} ${"x".repeat(60)}`));
    await log.flush();

    const current = await read();
    const first = parseLogLine(current[0] ?? "");
    expect(first).toMatchObject({ kind: "note" });
    expect(first?.kind === "note" && first.message).toContain(ROTATED_LOG_NAME);
    const older = await readFile(path.join(store.issueDir(7), ROTATED_LOG_NAME), "utf8");
    expect(older.length).toBeGreaterThan(0);
    // The current file stays near the limit.
    expect((await stat(agentLogPath(store, 7))).size).toBeLessThanOrEqual(600 + 200);
    // The newest message is in the current file.
    expect(current.at(-1)).toContain("message 11");
  });

  it("is never fatal: a write error is kept for the caller", async () => {
    await mkdir(store.issueDir(7), { recursive: true });
    await mkdir(agentLogPath(store, 7)); // a directory where the file should be
    const log = sink();
    expect(() => log.write(logEvent("lost"))).not.toThrow();
    await log.flush();
    expect(log.failure()).not.toBeNull();
  });
});

describe("readLogLines and followLog", () => {
  it("reads the rotated file first, and only complete lines", async () => {
    const dir = store.issueDir(7);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, ROTATED_LOG_NAME), "old-1\nold-2\n");
    await writeFile(agentLogPath(store, 7), "new-1\nnew-2\npartial");
    const { lines, offset } = await readLogLines(store, 7);
    expect(lines).toEqual(["old-1", "old-2", "new-1", "new-2"]);
    expect(offset).toBe("new-1\nnew-2\n".length);
  });

  it("reads nothing from a missing log", async () => {
    expect(await readLogLines(store, 7)).toEqual({ lines: [], offset: 0 });
  });

  it("follows appended lines, joins a line written in two parts, and restarts after a rotation", async () => {
    await mkdir(store.issueDir(7), { recursive: true });
    const file = agentLogPath(store, 7);
    await writeFile(file, "a\n");
    const seen: string[] = [];
    const controller = new AbortController();
    const done = followLog({
      store,
      issue: 7,
      offset: 2,
      onLines: (lines) => seen.push(...lines),
      signal: controller.signal,
      intervalMs: 10
    });

    const until = async (line: string): Promise<void> => {
      for (let wait = 0; wait < 500 && !seen.includes(line); wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(seen).toContain(line);
    };

    await appendFile(file, "b\nc-");
    await until("b");
    expect(seen).not.toContain("c-");
    await appendFile(file, "tail\n");
    await until("c-tail");
    // A rotation makes the file shorter: reading starts again at the top.
    await writeFile(file, "z\n");
    await until("z");

    controller.abort();
    await done;
    expect(seen).toEqual(["b", "c-tail", "z"]);
  });
});
