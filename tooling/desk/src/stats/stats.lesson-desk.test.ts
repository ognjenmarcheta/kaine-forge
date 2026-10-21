import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createLessonDesk, type LessonDesk } from "./stats.lesson-desk";
import { appendLessonRecords } from "./stats.lessons";
import type { LessonRecord } from "../contracts";
import { fakeGitHub, type FakeGitHub } from "../testing/github.fake";

const KEY = "check/pnpm lint";

const lesson = (issue: number): LessonRecord => ({
  schema: 1,
  at: `2026-10-1${issue}T09:00:00.000Z`,
  issue,
  role: "builder",
  source: "check",
  key: KEY,
  detail: "pnpm lint failed: import/order",
  file: null,
  count: 1,
  repo: null
});

let root: string | null = null;
afterEach(async () => {
  if (root !== null) await rm(root, { recursive: true, force: true });
  root = null;
});

const open = async (
  github: FakeGitHub = fakeGitHub()
): Promise<{ desk: () => LessonDesk; github: FakeGitHub }> => {
  root = await mkdtemp(path.join(tmpdir(), "desk-lessons-"));
  const stateRoot = root;
  await appendLessonRecords(stateRoot, [lesson(1), lesson(2)]);
  return {
    github,
    desk: () =>
      createLessonDesk({
        stateRoot,
        clock: { now: () => new Date("2026-10-20T12:00:00.000Z") },
        github,
        owner: undefined,
        currentRepo: () => Promise.resolve(null)
      })
  };
};

describe("promoted lessons", () => {
  it("takes a promoted key out of the candidates, keeps it on disk, and unpromote brings it back", async () => {
    const { desk } = await open();
    expect((await desk().report()).candidates.map((candidate) => candidate.key)).toEqual([KEY]);

    const promoted = await desk().actions.promote(KEY, "Encoded in the lint config.");
    expect(promoted).toMatchObject({ ok: true, value: { candidates: [] } });

    // Another desk process reads the same file.
    const report = await desk().report();
    expect(report.candidates).toEqual([]);
    expect(report.promoted).toEqual([
      { key: KEY, at: "2026-10-20T12:00:00.000Z", note: "Encoded in the lint config.", issue: null }
    ]);

    const restored = await desk().actions.unpromote(KEY);
    expect(restored.ok && restored.value.candidates.map((candidate) => candidate.key)).toEqual([
      KEY
    ]);
    expect((await desk().report()).promoted).toEqual([]);
  });

  it("refuses a key that no observation has", async () => {
    const { desk } = await open();
    expect(await desk().actions.promote("check/unknown", null)).toMatchObject({
      ok: false,
      code: "not-found"
    });
    expect(await desk().actions.unpromote(KEY)).toMatchObject({ ok: false, code: "not-found" });
  });
});

describe("an issue for a lesson", () => {
  it("opens exactly the previewed issue and promotes the key with its number", async () => {
    const { desk, github } = await open();
    const preview = await desk().actions.issuePreview(KEY);
    if (!preview.ok) throw new Error(preview.detail);

    const created = await desk().actions.createIssue(KEY, preview.value.digest);

    expect(github.createdIssues).toEqual([
      { title: preview.value.title, body: preview.value.body }
    ]);
    expect(created).toMatchObject({ ok: true, value: { issue: 501 } });
    expect(created.ok && created.value.report.promoted).toEqual([
      expect.objectContaining({ key: KEY, issue: 501 })
    ]);
    // A lesson gets one issue.
    expect(await desk().actions.issuePreview(KEY)).toMatchObject({
      ok: false,
      code: "lesson-refused"
    });
  });

  it("opens nothing when the lesson changed after the preview or GitHub fails", async () => {
    const { desk, github } = await open(fakeGitHub({ failCreateIssue: true }));
    const preview = await desk().actions.issuePreview(KEY);
    if (!preview.ok) throw new Error(preview.detail);
    if (root === null) throw new Error("no state root");
    await appendLessonRecords(root, [lesson(3)]);

    expect(await desk().actions.createIssue(KEY, preview.value.digest)).toMatchObject({
      ok: false,
      code: "lesson-refused"
    });
    const fresh = await desk().actions.issuePreview(KEY);
    if (!fresh.ok) throw new Error(fresh.detail);
    expect(await desk().actions.createIssue(KEY, fresh.value.digest)).toMatchObject({
      ok: false,
      code: "lesson-refused",
      detail: expect.stringContaining("GitHub failed")
    });
    expect(github.createdIssues).toEqual([]);
    expect((await desk().report()).promoted).toEqual([]);
  });
});
