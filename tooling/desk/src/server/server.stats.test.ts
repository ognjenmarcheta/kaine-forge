import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  issueDetailSchema,
  lessonIssueCreatedSchema,
  lessonIssueDraftSchema,
  lessonReportSchema,
  runStatsSchema,
  type LessonRecord,
  type RunRecord
} from "../contracts";
import { authenticated, createHarness, raw, type Harness } from "./server.testing";
import { createLessonDesk } from "../stats/stats.lesson-desk";
import { appendLessonRecords } from "../stats/stats.lessons";
import { fakeGitHub, type FakeGitHub } from "../testing/github.fake";

let harness: Harness | null = null;
let lessonRoot: string | null = null;
afterEach(async () => {
  if (lessonRoot !== null) await rm(lessonRoot, { recursive: true, force: true });
  lessonRoot = null;
  await harness?.cleanup();
  harness = null;
});

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue: 3,
  role: "builder",
  provider: "claude",
  model: "opus",
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: 60_000,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 },
  costUsd: 1,
  turns: 12,
  toolCalls: 20,
  editCalls: 2,
  failedToolCalls: 0,
  denials: 0,
  harness: null,
  planRisk: null,
  ...over
});

const RECORDS = [
  record(),
  record({ issue: 8, role: "reviewer", provider: "codex", costUsd: null })
];

describe("GET /api/stats", () => {
  it("groups the runs and joins each issue with its stage", async () => {
    harness = await createHarness({
      readRuns: () => Promise.resolve({ records: RECORDS, invalidLines: 1 })
    });
    await harness.seed(3, { stage: "pr-review" });
    const api = await authenticated(harness);

    const reply = await api.get("/api/stats");

    expect(reply.status).toBe(200);
    const stats = runStatsSchema.parse(reply.json());
    expect(stats.groups.map((group) => [group.role, group.provider, group.runs])).toEqual([
      ["builder", "claude", 1],
      ["reviewer", "codex", 1]
    ]);
    expect(stats.issues.map((issue) => [issue.issue, issue.stage])).toEqual([
      [3, "pr-review"],
      [8, null]
    ]);
    expect(stats.invalidLines).toBe(1);
  });

  it("answers with empty stats when the runtime has no run record", async () => {
    harness = await createHarness({ clock: { now: () => new Date("2026-10-13T12:00:00Z") } });
    const api = await authenticated(harness);
    const stats = runStatsSchema.parse((await api.get("/api/stats")).json());
    expect(stats).toMatchObject({ groups: [], issues: [], invalidLines: 0 });
    expect(stats.riskOutcomes).toEqual(
      ["low", "medium", "high"].map((risk) => ({ risk, issues: 0, shipped: 0, sentBack: 0 }))
    );
    expect(stats.days.map((day) => [day.date, day.runs, day.costUsd, day.shipped])).toEqual(
      ["07", "08", "09", "10", "11", "12", "13"].map((day) => [`2026-10-${day}`, 0, null, 0])
    );
  });

  it("needs a session", async () => {
    harness = await createHarness();
    expect((await raw(harness.desk, { path: "/api/stats" })).status).toBe(401);
  });
});

describe("GET /api/lessons", () => {
  it("answers with the runtime's report, an empty one without it, and only with a session", async () => {
    const report = {
      candidates: [],
      promoted: [],
      belowThreshold: 4,
      minIssues: 2,
      currentRepo: "c".repeat(64),
      invalidLines: 0
    };
    harness = await createHarness({ lessons: () => Promise.resolve(report) });
    const api = await authenticated(harness);
    expect(lessonReportSchema.parse((await api.get("/api/lessons")).json())).toEqual(report);
    expect((await raw(harness.desk, { path: "/api/lessons" })).status).toBe(401);
    await harness.cleanup();

    harness = await createHarness();
    const bare = await authenticated(harness);
    expect(lessonReportSchema.parse((await bare.get("/api/lessons")).json())).toMatchObject({
      candidates: [],
      belowThreshold: 0
    });
  });
});

describe("lesson routes", () => {
  const KEY = "check/pnpm lint";
  const lesson = (issue: number): LessonRecord => ({
    schema: 1,
    at: "2026-10-13T09:00:00.000Z",
    issue,
    role: "builder",
    source: "check",
    key: KEY,
    detail: "pnpm lint failed",
    file: null,
    count: 1,
    repo: null
  });

  const withLessons = async (): Promise<{ github: FakeGitHub; harness: Harness }> => {
    lessonRoot = await mkdtemp(path.join(tmpdir(), "desk-lessons-"));
    await appendLessonRecords(lessonRoot, [lesson(1), lesson(2)]);
    const github = fakeGitHub();
    const desk = createLessonDesk({
      stateRoot: lessonRoot,
      clock: { now: () => new Date("2026-10-20T12:00:00.000Z") },
      github,
      owner: undefined,
      currentRepo: () => Promise.resolve(null)
    });
    harness = await createHarness({ lessons: desk.report, lessonActions: desk.actions });
    return { github, harness };
  };

  it("opens the previewed issue only with confirm: true, and only once", async () => {
    const { github, harness: desk } = await withLessons();
    const api = await authenticated(desk);
    const preview = lessonIssueDraftSchema.parse(
      (await api.get(`/api/lessons/issue-preview?key=${encodeURIComponent(KEY)}`)).json()
    );

    for (const body of [
      { key: KEY, digest: preview.digest },
      { key: KEY, digest: preview.digest, confirm: false }
    ]) {
      expect((await api.post("/api/lessons/issue", body)).status).toBe(400);
    }
    expect(github.createdIssues).toEqual([]);

    const confirmed = { key: KEY, digest: preview.digest, confirm: true };
    const created = await api.post("/api/lessons/issue", confirmed);
    expect(created.status).toBe(200);
    expect(lessonIssueCreatedSchema.parse(created.json())).toMatchObject({
      issue: 501,
      report: { candidates: [], promoted: [{ key: KEY, issue: 501 }] }
    });
    expect(github.createdIssues).toEqual([{ title: preview.title, body: preview.body }]);

    const again = await api.post("/api/lessons/issue", confirmed);
    expect([again.status, again.json()]).toEqual([
      409,
      { error: { code: "lesson-refused", detail: expect.stringContaining("#501") } }
    ]);
  });

  it("promotes and unpromotes, answering the new report", async () => {
    const { harness: desk } = await withLessons();
    const api = await authenticated(desk);

    const promoted = await api.post("/api/lessons/promote", { key: KEY, note: " Done. " });
    expect(lessonReportSchema.parse(promoted.json())).toMatchObject({
      candidates: [],
      promoted: [{ key: KEY, note: "Done.", issue: null }]
    });
    const restored = await api.post("/api/lessons/unpromote", { key: KEY });
    expect(lessonReportSchema.parse(restored.json()).candidates).toHaveLength(1);
    expect((await api.post("/api/lessons/unpromote", { key: KEY })).status).toBe(404);
    expect((await api.post("/api/lessons/promote", { key: KEY, issue: 9 })).status).toBe(400);
  });
});

describe("GET /api/issues/:n runs", () => {
  it("carries only the runs of that issue, each with the capabilities it got", async () => {
    const received = record({
      at: "2026-10-13T10:00:00.000Z",
      capabilities: {
        provider: "claude",
        model: "opus",
        preset: "edit-code",
        sandbox: "docker",
        tools: { allow: ["Read", "Edit"], deny: ["WebFetch"] },
        extraTools: [],
        mcp: [],
        skills: ["kaine-test"],
        network: "container: the provider API through the desk proxy only",
        removed: [{ kind: "mcp", name: "serena", reason: "no MCP inside the container" }],
        notes: []
      }
    });
    harness = await createHarness({
      readRuns: () => Promise.resolve({ records: [...RECORDS, received], invalidLines: 0 })
    });
    await harness.seed(3);
    const api = await authenticated(harness);

    const detail = issueDetailSchema.parse((await api.get("/api/issues/3")).json());

    // A record from before the receipt existed stays valid next to one that has it.
    expect(detail.runs).toEqual([record(), received]);
  });
});
