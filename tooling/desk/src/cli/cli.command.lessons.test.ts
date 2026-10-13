import { afterEach, describe, expect, it } from "vitest";

import { lessonReportSchema, type LessonRecord } from "../contracts";
import { appendLessonRecords } from "../stats/stats.lessons";
import { createCliEnv, type CliEnv } from "../testing/cli.testing";

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});

const lesson = (issue: number, over: Partial<LessonRecord> = {}): LessonRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  issue,
  role: "builder",
  source: "stuck",
  key: "stuck/pnpm test",
  detail: "The agent ran `pnpm test` 8 times in a row \u001b[31mand it failed\u001b[0m.",
  file: null,
  count: 1,
  repo: null,
  ...over
});

describe("lessons", () => {
  it("lists a problem seen in two issues as plain text and refuses a bad threshold", async () => {
    env = await createCliEnv();
    await appendLessonRecords(env.stateRoot, [lesson(12), lesson(15)]);

    const result = await env.run("lessons");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stuck/pnpm test  2 issues (#12 #15)");
    expect(result.stdout).toContain("kaine-encode-knowledge");
    // Agent text reaches the terminal without control sequences.
    expect(result.stdout).not.toContain("\u001b[");

    const json = await env.run("lessons", "--json", "--source", "review");
    expect(lessonReportSchema.parse(JSON.parse(json.stdout))).toMatchObject({ candidates: [] });
    expect((await env.run("lessons", "--min-issues", "0")).code).toBe(2);
  });
});
