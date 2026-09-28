import { execFileSync } from "node:child_process";
import { beforeEach, expect, it, vi } from "vitest";

import { publishReview } from "./factory-github";
import { factoryConfigSchema, reviewLocations, type FactoryResult } from "./factory.util";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
const config = factoryConfigSchema.parse({
  enabled: true,
  repository: "owner/project",
  owner: "owner",
  image: `sha256:${"a".repeat(64)}`,
  models: { codex: "gpt-6-astra", claude: "claude-opus-5-5" },
  stages: Object.fromEntries(
    ["intake", "spec", "implement", "review", "learn"].map((stage) => [
      stage,
      { provider: "codex", model: "gpt-6-astra" }
    ])
  )
});
const pr = {
  number: 9,
  html_url: "https://github.com/owner/project/pull/9",
  state: "open",
  body: "",
  head: { sha: "a".repeat(40), ref: "KAINE-23-feat-factory" },
  base: { sha: "b".repeat(40), ref: "main" }
};
const result: FactoryResult = {
  issue: 23,
  revision: pr.head.sha,
  status: "completed",
  summary: "Review",
  nextAction: "none",
  files: [],
  evidence: [],
  findings: [{ path: "src/add.ts", line: 5, body: "Use addition", blocking: true }]
};
const diff =
  "diff --git a/src/add.ts b/src/add.ts\n--- a/src/add.ts\n+++ b/src/add.ts\n@@ -4,2 +4,2 @@\n context\n-old\n+new\n";
beforeEach(() => vi.resetAllMocks());
it("publishes validated line comments using COMMENT only", () => {
  vi.mocked(execFileSync).mockReturnValueOnce(JSON.stringify(pr)).mockReturnValueOnce("{}");
  publishReview(config, 9, pr.head.sha, pr.base.sha, result.summary, reviewLocations(result, diff));
  const args = vi.mocked(execFileSync).mock.calls.at(-1)?.[1];
  const options = vi.mocked(execFileSync).mock.calls.at(-1)?.[2];
  expect(args).toContain("repos/owner/project/pulls/9/reviews");
  expect(options).toMatchObject({
    input: JSON.stringify({
      event: "COMMENT",
      commit_id: pr.head.sha,
      body: "Review",
      comments: [{ path: "src/add.ts", line: 5, side: "RIGHT", body: "Required: Use addition" }]
    })
  });
});
it.each(["head", "base"] as const)("rejects a stale %s before any GitHub write", (field) => {
  vi.mocked(execFileSync).mockReturnValue(
    JSON.stringify({ ...pr, [field]: { ...pr[field], sha: "c".repeat(40) } })
  );
  expect(() => publishReview(config, 9, pr.head.sha, pr.base.sha, "Review", [])).toThrow(
    "PR changed"
  );
  expect(execFileSync).toHaveBeenCalledOnce();
});
it("rejects invented paths and lines before review publication", () => {
  expect(reviewLocations(result, diff)).toHaveLength(1);
  expect(() =>
    reviewLocations({ ...result, findings: [{ ...result.findings[0]!, line: 99 }] }, diff)
  ).toThrow();
  expect(() =>
    reviewLocations({ ...result, findings: [{ ...result.findings[0]!, path: "other.ts" }] }, diff)
  ).toThrow();
});
