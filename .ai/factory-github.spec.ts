import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

import { publishReview, reviewFeedback, publishPullRequest, statusComment } from "./factory-github";
import { FactoryStore } from "./factory-store";
import {
  factoryRunSchema,
  fingerprint,
  factoryConfigSchema,
  reviewLocations,
  type FactoryResult
} from "./factory.util";

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
  publishReview(
    config,
    9,
    pr.head.sha,
    pr.base.sha,
    result.summary,
    reviewLocations(result, diff),
    () => {}
  );
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
  expect(() => publishReview(config, 9, pr.head.sha, pr.base.sha, "Review", [], () => {})).toThrow(
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

it("collects owner feedback from both implementation and specification PRs", () => {
  vi.mocked(execFileSync)
    .mockReturnValueOnce(JSON.stringify([pr]))
    .mockReturnValueOnce(
      JSON.stringify([{ id: 1, body: "Implementation fix", user: { login: "owner" } }])
    )
    .mockReturnValueOnce(
      JSON.stringify([{ ...pr, number: 10, html_url: "https://github.com/owner/project/pull/10" }])
    )
    .mockReturnValueOnce(
      JSON.stringify([
        { id: 2, body: "Specification fix", user: { login: "owner" } },
        { id: 3, body: "Ignore", user: { login: "bot" } }
      ])
    );
  const feedback = reviewFeedback(config, 23);
  expect(feedback.map((item) => item.comments.map((comment) => comment.body))).toEqual([
    ["Implementation fix"],
    ["Specification fix"]
  ]);
  expect(vi.mocked(execFileSync).mock.calls[2]?.[1]?.[1]).toContain("KAINE-23-docs-spec");
});
it("checks cancellation after the final GitHub read and before posting a review", () => {
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify(pr));
  expect(() =>
    publishReview(config, 9, pr.head.sha, pr.base.sha, "Review", [], () => {
      throw new Error("Run cancelled");
    })
  ).toThrow("Run cancelled");
  expect(execFileSync).toHaveBeenCalledOnce();
});

const runFixture = () =>
  factoryRunSchema.parse({
    id: randomUUID(),
    issue: 23,
    stage: "implement",
    provider: "codex",
    model: "model",
    revision: "a".repeat(40),
    authorization: "1",
    snapshot: "snapshot",
    startedAt: "now",
    finishedAt: null,
    status: "running",
    detail: "",
    branch: "KAINE-23-feat-factory",
    pr: null,
    validation: [],
    result: null,
    invocations: []
  });
it("records posted comment identity and does not overwrite an owner's matching marker", () => {
  const store = new FactoryStore(mkdtempSync(path.join(tmpdir(), "factory-comment-")));
  const run = runFixture();
  const release = store.acquire(run.id);
  const ownerComment = {
    id: 11,
    body: `<!-- kaine-factory:${run.id} --> requirements`,
    updated_at: "today",
    user: { login: "owner" }
  };
  const posted = { ...ownerComment, id: 12, body: `<!-- kaine-factory:${run.id} -->\nfailed` };
  vi.mocked(execFileSync)
    .mockReturnValueOnce(JSON.stringify([ownerComment]))
    .mockReturnValueOnce(JSON.stringify(posted));
  try {
    statusComment(config, run, "failed", store);
    expect(vi.mocked(execFileSync).mock.calls[1]?.[1]).toEqual([
      "api",
      "repos/owner/project/issues/23/comments",
      "--method",
      "POST",
      "--input",
      "-"
    ]);
    expect(store.comments(23)).toEqual([{ id: 12, fingerprint: fingerprint(posted.body) }]);
    expect(store.runs()[0]?.statusComment?.id).toBe(12);
  } finally {
    release();
    rmSync(store.directory, { recursive: true, force: true });
  }
});
it("checks cancellation after PR lookup and reuses an existing PR on retry", () => {
  const run = runFixture();
  vi.mocked(execFileSync).mockReturnValueOnce(JSON.stringify([pr]));
  expect(() =>
    publishPullRequest(config, run, "fix: test", "body", "main", () => {
      throw new Error("Run cancelled");
    })
  ).toThrow("Run cancelled");
  expect(execFileSync).toHaveBeenCalledOnce();
  vi.mocked(execFileSync)
    .mockReturnValueOnce(JSON.stringify([pr]))
    .mockReturnValueOnce(JSON.stringify(pr));
  expect(publishPullRequest(config, run, "fix: test", "body", "main", () => {})).toEqual(pr);
  expect(vi.mocked(execFileSync).mock.calls.at(-1)?.[1]).toEqual([
    "api",
    "repos/owner/project/pulls/9",
    "--method",
    "PATCH",
    "--input",
    "-"
  ]);
});
