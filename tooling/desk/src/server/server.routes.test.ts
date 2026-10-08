import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ARTIFACT_IDS,
  REFUSAL_CODES,
  REVIEW_SECTIONS,
  actionResponseSchema,
  healthReportSchema,
  issueDetailSchema,
  issueListSchema,
  logResponseSchema,
  type ApiErrorCode
} from "../contracts";
import { ARTIFACT_SPECS } from "./server.artifacts";
import { parseContractProgress } from "./server.detail";
import { STATUS_BY_CODE } from "./server.errors";
import {
  authenticated,
  createHarness,
  makeState,
  stoppedAt,
  type Api,
  type Harness
} from "./server.testing";
import { REFUSALS, type PipelineResult } from "../engine/pipeline.types";
import { shipPlanSchema } from "../ship/ship.contract";

let harness: Harness;
let api: Api;

beforeEach(async () => {
  harness = await createHarness();
  api = await authenticated(harness);
});
afterEach(async () => {
  await harness.cleanup();
});

const DIFF_HASH = "a".repeat(64);

const checkReport = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    passed: true,
    kind: "loop",
    steps: [
      {
        argv: ["pnpm", "check:affected"],
        code: 0,
        timedOut: false,
        tail: "all green",
        durationMs: 1234
      }
    ],
    fingerprint: null,
    diffHash: DIFF_HASH,
    generatedDrift: false,
    startedAt: "2026-03-01T10:00:00.000Z",
    finishedAt: "2026-03-01T10:00:02.000Z",
    ...overrides
  });

const reviewArtifact = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    review: {
      verdict: "approve",
      findings: [
        {
          severity: "Nit",
          blocking: false,
          file: "src/a.ts",
          line: 3,
          section: "Correctness",
          summary: "Rename this",
          fix: ""
        },
        {
          severity: "Consider",
          blocking: false,
          file: "src/b.ts",
          line: 9,
          section: "Quality Gates",
          summary: "Add a test",
          fix: "Test the branch"
        }
      ],
      acceptanceStatus: [{ criterion: "It works", status: "met", evidence: "test passes" }],
      reviewSections: REVIEW_SECTIONS.map((heading) => ({ heading, verdict: "pass", notes: "" })),
      prDraft: { title: "feat: thing", body: "Body" },
      plainLanguage: "Looks fine."
    },
    rejected: [],
    diffHash: DIFF_HASH,
    ...overrides
  });

describe("GET /api/health", () => {
  it("mirrors the doctor report and caches it for the ttl", async () => {
    const first = await api.get("/api/health");
    const second = await api.get("/api/health");
    expect(first.status).toBe(200);
    const report = healthReportSchema.parse(first.json());
    expect(report.ok).toBe(true);
    expect(report.checks).toEqual([
      { id: "node", label: "Node.js", status: "ok", detail: "v22.0.0" }
    ]);
    expect(second.json()).toEqual(first.json());
    expect(harness.health).toHaveBeenCalledTimes(1);
  });

  it("runs the doctor again after the ttl and reports a failing check", async () => {
    const short = await createHarness({ healthTtlMs: 0 });
    try {
      short.health.mockResolvedValue({
        ok: false,
        checks: [{ id: "gh", label: "gh", status: "error", detail: "not installed" }]
      });
      const shortApi = await authenticated(short);
      expect(((await shortApi.get("/api/health")).json() as { ok: boolean }).ok).toBe(false);
      await shortApi.get("/api/health");
      expect(short.health).toHaveBeenCalledTimes(2);
    } finally {
      await short.cleanup();
    }
  });

  it("shares one doctor run between concurrent requests", async () => {
    await Promise.all([api.get("/api/health"), api.get("/api/health"), api.get("/api/health")]);
    expect(harness.health).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/issues", () => {
  it("lists nothing for a new store", async () => {
    const reply = await api.get("/api/issues");
    expect(reply.status).toBe(200);
    expect(issueListSchema.parse(reply.json())).toEqual({ issues: [] });
  });

  it("lists readable and unreadable issues with their title from issue.json", async () => {
    await harness.seed(3, { stage: "build", status: "running", loops: { check: 1, review: 0 } });
    await harness.artifact(
      3,
      "issue.json",
      JSON.stringify({ number: 3, title: "Fix it", url: "https://x/3", labels: ["bug"] })
    );
    await harness.artifact(
      3,
      "ticket.md",
      "# Ticket #3\n\nReadiness: contract 5/6, missing: scope\n"
    );
    await harness.seed(5, {
      stage: "needs-you",
      status: "waiting",
      resumeStage: "check",
      history: [
        {
          at: "2026-03-01T10:00:00.000Z",
          stage: "needs-you",
          event: "needs-you",
          note: "Checks failed"
        }
      ]
    });
    await mkdir(harness.store.issueDir(8), { recursive: true });
    await writeFile(harness.store.statePath(8), "{broken");

    const list = issueListSchema.parse((await api.get("/api/issues")).json());
    expect(list.issues.map((issue) => issue.issueNumber)).toEqual([3, 5, 8]);
    expect(list.issues[0]).toMatchObject({
      readable: true,
      title: "Fix it",
      url: "https://x/3",
      labels: ["bug"],
      stage: "build",
      status: "running",
      busy: false,
      needsYouReason: null,
      resumeStage: null,
      prUrl: null,
      contract: { found: 5, total: 6 },
      // The build has not written its start yet, so the history cannot say when it began.
      stageEnteredAt: null,
      progress: ["passed", "passed", "passed", "running", "idle", "idle", "idle", "idle"],
      currentNode: "build"
    });
    expect(list.issues[1]).toMatchObject({
      readable: true,
      title: null,
      stage: "needs-you",
      needsYouReason: "Checks failed",
      resumeStage: "check",
      contract: null,
      stageEnteredAt: "2026-03-01T10:00:00.000Z",
      progress: ["idle", "idle", "idle", "idle", "failed", "idle", "idle", "idle"],
      currentNode: "check"
    });
    expect(list.issues[2]).toMatchObject({
      readable: false,
      reason: "invalid-json",
      issueNumber: 8
    });
  });
});

describe("GET /api/issues/:n", () => {
  it("returns state, flow model, artifact index, contract, check, review and ship readiness", async () => {
    await harness.seed(4, { stage: "pr-review", status: "waiting" });
    await harness.artifact(
      4,
      "ticket.md",
      "# Ticket #4\n\nReadiness: contract 5/6, missing: scope\n"
    );
    await harness.artifact(4, "check-report.json", checkReport());
    await harness.artifact(4, "review.json", reviewArtifact());
    await harness.artifact(4, "diff.patch", "diff --git a/x b/x\n");

    const reply = await api.get("/api/issues/4");
    expect(reply.status).toBe(200);
    const detail = issueDetailSchema.parse(reply.json());
    expect(detail.summary).toMatchObject({ readable: true, issueNumber: 4 });
    expect(detail.state.stage).toBe("pr-review");
    expect(detail.flow.current).toBe("pr-review");
    expect(detail.flow.nodes.find((node) => node.id === "pr-review")?.status).toBe("waiting");
    expect(detail.contract).toEqual({ found: 5, total: 6, missing: ["scope"] });
    expect(detail.check).toMatchObject({ passed: true, kind: "loop", diffHash: DIFF_HASH });
    expect(detail.check?.steps[0]).toEqual({
      argv: ["pnpm", "check:affected"],
      code: 0,
      timedOut: false,
      durationMs: 1234
    });
    expect(JSON.stringify(detail)).not.toContain("all green");
    expect(detail.review).toMatchObject({
      verdict: "approve",
      blocking: 0,
      bySeverity: { Critical: 0, Consider: 1, Nit: 1, FYI: 0 },
      rejected: 0,
      plainLanguage: "Looks fine."
    });
    expect(detail.review?.findings).toHaveLength(2);
    expect(detail.artifacts.filter((entry) => entry.present).map((entry) => entry.id)).toEqual([
      "ticket",
      "check-report",
      "review",
      "diff"
    ]);
    expect(detail.artifacts.map((entry) => entry.id)).toEqual([...ARTIFACT_IDS]);
    expect(detail.ship).toEqual({
      atGate: true,
      checkPassed: true,
      reviewApproved: true,
      reviewedDiffMatches: true,
      currentDiffMatches: null,
      ready: true
    });
  });

  it("returns null parts for an issue that has no artifacts yet", async () => {
    await harness.seed(2, { stage: "plan", status: "running" });
    const detail = issueDetailSchema.parse((await api.get("/api/issues/2")).json());
    expect(detail.contract).toBeNull();
    expect(detail.check).toBeNull();
    expect(detail.review).toBeNull();
    expect(detail.ship).toMatchObject({ atGate: false, ready: false, checkPassed: null });
    expect(detail.flow.nodes.find((node) => node.id === "plan")?.status).toBe("running");
  });

  it("ignores an artifact that fails its schema", async () => {
    await harness.seed(2);
    await harness.artifact(2, "check-report.json", '{"passed":"yes"}');
    await harness.artifact(2, "review.json", "not json");
    const detail = issueDetailSchema.parse((await api.get("/api/issues/2")).json());
    expect(detail.check).toBeNull();
    expect(detail.review).toBeNull();
  });

  it.each([
    {
      name: "the check failed",
      check: { passed: false, fingerprint: "abc" },
      review: {},
      ready: false
    },
    {
      name: "the review saw another diff than the check",
      check: {},
      review: { diffHash: "b".repeat(64) },
      ready: false
    }
  ])("is not ready when $name", async ({ check, review, ready }) => {
    await harness.seed(4, { stage: "pr-review" });
    await harness.artifact(4, "check-report.json", checkReport(check));
    await harness.artifact(4, "review.json", reviewArtifact(review));
    const detail = issueDetailSchema.parse((await api.get("/api/issues/4")).json());
    expect(detail.ship.ready).toBe(ready);
  });

  it("is not ready when the review asks for changes or has a blocking finding", async () => {
    await harness.seed(4, { stage: "pr-review" });
    await harness.artifact(4, "check-report.json", checkReport());
    await harness.artifact(
      4,
      "review.json",
      JSON.stringify({
        ...JSON.parse(reviewArtifact()),
        review: {
          ...JSON.parse(reviewArtifact()).review,
          verdict: "changes-requested",
          findings: [
            {
              severity: "Critical",
              blocking: true,
              file: "src/a.ts",
              line: 1,
              section: "Correctness",
              summary: "Broken",
              fix: ""
            }
          ]
        }
      })
    );
    const detail = issueDetailSchema.parse((await api.get("/api/issues/4")).json());
    expect(detail.review).toMatchObject({ verdict: "changes-requested", blocking: 1 });
    expect(detail.ship).toMatchObject({ reviewApproved: false, ready: false });
  });

  it("compares the checked diff with the worktree diff at the gate", async () => {
    const hash = vi.fn<(state: unknown) => Promise<string | null>>();
    const checking = await createHarness({ currentDiffHash: hash });
    try {
      await checking.seed(4, { stage: "pr-review" });
      await checking.artifact(4, "check-report.json", checkReport());
      await checking.artifact(4, "review.json", reviewArtifact());
      const checkingApi = await authenticated(checking);
      const read = async () =>
        issueDetailSchema.parse((await checkingApi.get("/api/issues/4")).json()).ship;

      hash.mockResolvedValue(DIFF_HASH);
      expect(await read()).toMatchObject({ currentDiffMatches: true, ready: true });
      hash.mockResolvedValue("c".repeat(64));
      expect(await read()).toMatchObject({ currentDiffMatches: false, ready: false });
      hash.mockResolvedValue(null);
      expect(await read()).toMatchObject({ currentDiffMatches: null, ready: true });
      hash.mockRejectedValue(new Error("git exploded"));
      expect(await read()).toMatchObject({ currentDiffMatches: null });
    } finally {
      await checking.cleanup();
    }
  });

  it("answers 404 for an unknown issue and 409 for an unreadable one", async () => {
    const missing = await api.get("/api/issues/77");
    expect(missing.status).toBe(404);
    expect(missing.json()).toEqual({ error: { code: "unknown-issue", detail: null } });

    await mkdir(harness.store.issueDir(9), { recursive: true });
    await writeFile(harness.store.statePath(9), JSON.stringify({ schemaVersion: 99 }));
    const broken = await api.get("/api/issues/9");
    expect(broken.status).toBe(409);
    expect(broken.json()).toEqual({
      error: { code: "unreadable", detail: expect.stringContaining("unknown-schema-version") }
    });
  });

  it("parses the readiness line of the ticket", () => {
    expect(parseContractProgress("Readiness: contract 6/6\n")).toEqual({
      found: 6,
      total: 6,
      missing: []
    });
    expect(
      parseContractProgress("x\nReadiness: contract 4/6, missing: scope, evidence\ny")
    ).toEqual({
      found: 4,
      total: 6,
      missing: ["scope", "evidence"]
    });
    expect(parseContractProgress("no readiness here")).toBeNull();
  });
});

describe("GET /api/issues/:n/artifacts/:id", () => {
  it("whitelists exactly the artifact ids", () => {
    expect(Object.keys(ARTIFACT_SPECS).sort()).toEqual([...ARTIFACT_IDS].sort());
    expect([...ARTIFACT_IDS].sort()).toEqual(
      [
        "build",
        "check-report",
        "diff",
        "log",
        "plan",
        "pr-body",
        "review",
        "ship-plan",
        "ticket"
      ].sort()
    );
  });

  it.each([
    { id: "ticket", file: "ticket.md", type: "text/markdown; charset=utf-8" },
    { id: "plan", file: "plan.json", type: "application/json; charset=utf-8" },
    { id: "build", file: "build.json", type: "application/json; charset=utf-8" },
    { id: "check-report", file: "check-report.json", type: "application/json; charset=utf-8" },
    { id: "review", file: "review.json", type: "application/json; charset=utf-8" },
    { id: "diff", file: "diff.patch", type: "text/plain; charset=utf-8" },
    { id: "pr-body", file: "pr-body.md", type: "text/markdown; charset=utf-8" },
    { id: "ship-plan", file: "ship-plan.json", type: "application/json; charset=utf-8" }
  ])("returns $file raw as $type", async ({ id, file, type }) => {
    await harness.seed(1);
    const content = `<script>alert("${id}")</script>\n**raw**`;
    await harness.artifact(1, file, content);
    const reply = await api.get(`/api/issues/1/artifacts/${id}`);
    expect(reply.status).toBe(200);
    expect(reply.headers["content-type"]).toBe(type);
    expect(reply.text).toBe(content);
  });

  it("returns the event log from the issue directory", async () => {
    await harness.seed(1);
    await writeFile(harness.store.eventsPath(1), '{"event":"a"}\n');
    const reply = await api.get("/api/issues/1/artifacts/log");
    expect(reply.status).toBe(200);
    expect(reply.text).toBe('{"event":"a"}\n');
  });

  it("answers 404 artifact-missing for a whitelisted file that does not exist yet", async () => {
    await harness.seed(1);
    const reply = await api.get("/api/issues/1/artifacts/plan");
    expect(reply.status).toBe(404);
    expect(reply.json()).toEqual({ error: { code: "artifact-missing", detail: null } });
  });

  it("answers 404 unknown-issue for an issue without state", async () => {
    const reply = await api.get("/api/issues/5/artifacts/plan");
    expect(reply.status).toBe(404);
    expect(reply.json()).toEqual({ error: { code: "unknown-issue", detail: null } });
  });

  it("does not serve a directory in place of a file", async () => {
    await harness.seed(1);
    await mkdir(path.join(harness.store.artifactsDir(1), "plan.json"), { recursive: true });
    expect((await api.get("/api/issues/1/artifacts/plan")).status).toBe(404);
  });

  it("does not serve a link in place of a file", async () => {
    await harness.seed(1);
    const target = path.join(harness.root, "elsewhere.txt");
    await writeFile(target, "outside");
    await mkdir(harness.store.artifactsDir(1), { recursive: true });
    await symlink(target, path.join(harness.store.artifactsDir(1), "build.json"));
    expect((await api.get("/api/issues/1/artifacts/build")).status).toBe(404);
  });
});

describe("GET /api/issues/:n/log", () => {
  it("returns the buffered entries after a sequence number, redacted", async () => {
    await harness.seed(6);
    harness.bus.emit({ type: "log", issue: 6, message: "first" });
    harness.bus.emit({
      type: "log",
      issue: 6,
      message: "using Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789"
    });
    harness.bus.emit({ type: "log", issue: 7, message: "other issue" });
    harness.bus.emit({
      type: "history",
      issue: 6,
      event: { at: "2026-03-01T10:00:00.000Z", stage: "plan", event: "stage-started" }
    });
    harness.bus.emit({
      type: "agent",
      issue: 6,
      role: "planner",
      event: { type: "tool_call", id: "1", tool: "Read", paths: ["src/a.ts"] }
    });

    const all = logResponseSchema.parse((await api.get("/api/issues/6/log")).json());
    expect(all.entries.map((entry) => entry.kind)).toEqual(["log", "log", "history", "agent"]);
    expect(all.entries.map((entry) => entry.issueNumber)).toEqual([6, 6, 6, 6]);
    expect(all.entries[2]).toMatchObject({
      at: "2026-03-01T10:00:00.000Z",
      text: "plan: stage-started"
    });
    expect(all.entries[3]?.text).toContain("Read");
    expect(JSON.stringify(all)).not.toContain("ghp_abcdef");
    expect(JSON.stringify(all)).not.toContain("other issue");

    const second = all.entries[1]?.seq ?? 0;
    const later = logResponseSchema.parse(
      (await api.get(`/api/issues/6/log?after=${second}`)).json()
    );
    expect(later.entries.map((entry) => entry.kind)).toEqual(["history", "agent"]);
    expect(later.last).toBe(all.last);

    const none = logResponseSchema.parse(
      (await api.get(`/api/issues/6/log?after=${all.last}`)).json()
    );
    expect(none).toEqual({ entries: [], last: all.last });
  });

  it("keeps only the newest entries of an issue", async () => {
    const small = await createHarness({ logCapacity: 3 });
    try {
      await small.seed(6);
      const smallApi = await authenticated(small);
      for (let index = 1; index <= 5; index += 1) {
        small.bus.emit({ type: "log", issue: 6, message: `line ${index}` });
      }
      const body = logResponseSchema.parse((await smallApi.get("/api/issues/6/log")).json());
      expect(body.entries.map((entry) => entry.text.slice(-6))).toEqual([
        "line 3",
        "line 4",
        "line 5"
      ]);
    } finally {
      await small.cleanup();
    }
  });

  it.each(["abc", "-1", "1.5", "", "99999999999999999999"])("rejects after=%s", async (after) => {
    await harness.seed(6);
    expect((await api.get(`/api/issues/6/log?after=${after}`)).status).toBe(400);
  });

  it("answers 404 for an unknown issue", async () => {
    expect((await api.get("/api/issues/6/log")).status).toBe(404);
  });
});

describe("POST /api/issues/:n/actions", () => {
  it("starts an issue that has no state yet", async () => {
    const reply = await api.post("/api/issues/12/actions", { action: "start", override: true });
    expect(reply.status).toBe(200);
    expect(harness.runner.start).toHaveBeenCalledWith(12, { override: true });
    expect(actionResponseSchema.parse(reply.json())).toMatchObject({
      status: "done",
      action: "start",
      issueNumber: 12,
      outcome: { stop: "gate", stage: "plan-gate", message: "Plan ready" }
    });
  });

  it("defaults override to false", async () => {
    await api.post("/api/issues/12/actions", { action: "start" });
    expect(harness.runner.start).toHaveBeenCalledWith(12, { override: false });
  });

  it.each([
    {
      name: "approve",
      body: { action: "approve" },
      check: (h: Harness) => expect(h.runner.approvePlan).toHaveBeenCalledWith(3)
    },
    {
      name: "feedback",
      body: { action: "feedback", to: "build", text: "  please fix  " },
      check: (h: Harness) =>
        expect(h.runner.feedback).toHaveBeenCalledWith(3, "build", "please fix")
    },
    {
      name: "continue",
      body: { action: "continue" },
      check: (h: Harness) => expect(h.runner.continueFrom).toHaveBeenCalledWith(3, undefined)
    },
    {
      name: "continue from a stage",
      body: { action: "continue", from: "check" },
      check: (h: Harness) => expect(h.runner.continueFrom).toHaveBeenCalledWith(3, "check")
    },
    {
      name: "cancel",
      body: { action: "cancel" },
      check: (h: Harness) => expect(h.runner.cancel).toHaveBeenCalledWith(3)
    },
    {
      name: "remove",
      body: { action: "remove", force: true },
      check: (h: Harness) => expect(h.runner.remove).toHaveBeenCalledWith(3, { force: true })
    },
    {
      name: "ship",
      body: { action: "ship", confirm: true, dryRun: false },
      check: (h: Harness) =>
        expect(h.runner.ship).toHaveBeenCalledWith(3, { confirm: true, dryRun: false })
    },
    {
      name: "ship dry run",
      body: { action: "ship", confirm: false, dryRun: true },
      check: (h: Harness) =>
        expect(h.runner.ship).toHaveBeenCalledWith(3, { confirm: false, dryRun: true })
    }
  ])("calls the runner for $name", async ({ body, check }) => {
    await harness.seed(3);
    const reply = await api.post("/api/issues/3/actions", body);
    expect(reply.status).toBe(200);
    check(harness);
  });

  it("answers a ship dry run as done at the gate, with the plan's blockers as the message", async () => {
    const state = makeState(3);
    harness.runner.ship.mockResolvedValueOnce({
      outcome: "dry-run",
      state,
      plan: shipPlanSchema.parse({
        version: 1,
        issue: 3,
        dryRun: true,
        generatedAt: "2026-10-07T09:00:00.000Z",
        branch: "KAINE-3-feat-x",
        baseSha: "a".repeat(40),
        gate: {
          ok: false,
          failures: [{ kind: "refs-baseline-missing", message: "No baseline." }]
        },
        changeset: { kind: "none", reason: "no source change" },
        changesetText: null,
        commitHeader: "feat: x",
        pullRequest: { base: "main", draft: true, title: "feat: x" },
        files: ["src/x.ts"],
        bodyHeadings: [],
        unfilledHeadings: [],
        attribution: [],
        commitlint: { ok: true, output: "" },
        gitIdentityProblem: null,
        pushes: "origin KAINE-3-feat-x"
      }),
      files: { plan: "/a/ship-plan.json", prBody: "/a/pr-body.md", commitMessage: "/a/c.txt" }
    });
    await harness.seed(3);
    const reply = await api.post("/api/issues/3/actions", {
      action: "ship",
      confirm: false,
      dryRun: true
    });
    expect(reply.status).toBe(200);
    expect(actionResponseSchema.parse(reply.json())).toMatchObject({
      status: "done",
      outcome: {
        stop: "gate",
        stage: state.stage,
        message: "refs-baseline-missing: No baseline."
      }
    });
  });

  it("reports a removal as done with no stage", async () => {
    await harness.seed(3);
    const reply = await api.post("/api/issues/3/actions", { action: "remove" });
    expect(actionResponseSchema.parse(reply.json())).toMatchObject({
      status: "done",
      outcome: { stop: "removed", stage: null }
    });
  });

  it.each([
    { name: "an unknown action", body: { action: "merge" } },
    { name: "a client-supplied path", body: { action: "start", snapshotFile: "/etc/passwd" } },
    { name: "a client-supplied organization", body: { action: "approve", organizationId: "x" } },
    { name: "feedback without text", body: { action: "feedback", to: "build" } },
    { name: "feedback to a gate", body: { action: "feedback", to: "plan-gate", text: "x" } },
    { name: "a ship that is not confirmed", body: { action: "ship", confirm: false } },
    { name: "an array body", body: [] },
    { name: "null", body: null }
  ])("rejects $name with 400 and never calls the runner", async ({ body }) => {
    await harness.seed(3);
    const reply = await api.post("/api/issues/3/actions", body);
    expect(reply.status).toBe(400);
    expect(reply.json()).toEqual({ error: { code: "bad-request", detail: expect.any(String) } });
    for (const call of Object.values(harness.runner)) expect(call).not.toHaveBeenCalled();
  });

  it("answers 404 unknown-issue for an action on an issue without state", async () => {
    for (const body of [
      { action: "approve" },
      { action: "feedback", to: "plan", text: "x" },
      { action: "continue" },
      { action: "cancel" },
      { action: "remove" },
      { action: "ship", confirm: true }
    ]) {
      const reply = await api.post("/api/issues/40/actions", body);
      expect(reply.status).toBe(404);
      expect(reply.json()).toEqual({ error: { code: "unknown-issue", detail: null } });
    }
    expect(harness.runner.approvePlan).not.toHaveBeenCalled();
  });

  it("covers every refusal of the engine with a status and a code", () => {
    expect([...REFUSAL_CODES]).toEqual([...REFUSALS]);
  });

  it.each([...REFUSAL_CODES])("maps the refusal %s to its status and code", async (refusal) => {
    await harness.seed(3);
    harness.runner.approvePlan.mockResolvedValue({
      outcome: "refused",
      refusal,
      reason: `engine says ${refusal}`,
      state: null
    });
    const reply = await api.post("/api/issues/3/actions", { action: "approve" });
    const code: ApiErrorCode = refusal;
    expect(reply.status).toBe(STATUS_BY_CODE[code]);
    expect(reply.status).toBe(refusal === "unknown-issue" ? 404 : 409);
    expect(reply.json()).toEqual({ error: { code, detail: `engine says ${refusal}` } });
  });

  it("maps a refused remove to 409 with the engine's code", async () => {
    await harness.seed(3);
    harness.runner.remove.mockResolvedValue({
      outcome: "refused",
      refusal: "worktree-dirty",
      reason: "The worktree has uncommitted work.",
      state: null
    });
    const reply = await api.post("/api/issues/3/actions", { action: "remove", force: false });
    expect(reply.status).toBe(409);
    expect(reply.json()).toEqual({
      error: { code: "worktree-dirty", detail: "The worktree has uncommitted work." }
    });
  });

  it("answers 500 internal without leaking a runner failure", async () => {
    await harness.seed(3);
    harness.runner.approvePlan.mockRejectedValue(new Error("secret path /Users/me/.ssh"));
    const reply = await api.post("/api/issues/3/actions", { action: "approve" });
    expect(reply.status).toBe(500);
    expect(reply.json()).toEqual({ error: { code: "internal", detail: null } });
    expect(reply.text).not.toContain("secret path");
    const log = logResponseSchema.parse((await api.get("/api/issues/3/log")).json());
    expect(log.entries.some((entry) => entry.text.includes("approve failed"))).toBe(true);
    // The failure released the issue.
    harness.runner.approvePlan.mockResolvedValue(stoppedAt(makeState(3)));
    expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(200);
  });
});

describe("single flight per issue", () => {
  const pending = (): {
    promise: Promise<PipelineResult>;
    finish: (result: PipelineResult) => void;
  } => {
    let finish: (result: PipelineResult) => void = () => undefined;
    const promise = new Promise<PipelineResult>((resolve) => {
      finish = resolve;
    });
    return { promise, finish };
  };

  it("answers 202 for a slow action and 409 busy for a second one on the same issue", async () => {
    await harness.seed(3);
    await harness.seed(4);
    const slow = pending();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);

    const first = await api.post("/api/issues/3/actions", { action: "approve" });
    expect(first.status).toBe(202);
    expect(actionResponseSchema.parse(first.json())).toEqual({
      status: "accepted",
      action: "approve",
      issueNumber: 3
    });

    const second = await api.post("/api/issues/3/actions", {
      action: "feedback",
      to: "plan",
      text: "again"
    });
    expect(second.status).toBe(409);
    expect(second.json()).toEqual({ error: { code: "busy", detail: expect.any(String) } });
    expect(harness.runner.feedback).not.toHaveBeenCalled();

    // Another issue is free.
    expect((await api.post("/api/issues/4/actions", { action: "approve" })).status).toBe(200);

    const list = issueListSchema.parse((await api.get("/api/issues")).json());
    expect(list.issues.find((issue) => issue.issueNumber === 3)?.busy).toBe(true);
    expect(list.issues.find((issue) => issue.issueNumber === 4)?.busy).toBe(false);

    slow.finish(stoppedAt(makeState(3)));
    await vi.waitFor(async () => {
      const again = await api.post("/api/issues/3/actions", { action: "approve" });
      expect(again.status).toBe(200);
    });
  });

  it("lets cancel and remove through while an action runs", async () => {
    await harness.seed(3);
    const slow = pending();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);
    expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(202);

    expect((await api.post("/api/issues/3/actions", { action: "cancel" })).status).toBe(200);
    expect(harness.runner.cancel).toHaveBeenCalledWith(3);
    expect(
      (await api.post("/api/issues/3/actions", { action: "remove", force: true })).status
    ).toBe(200);
    expect(harness.runner.remove).toHaveBeenCalledWith(3, { force: true });
    // Other actions still wait.
    expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(409);
    slow.finish(stoppedAt(makeState(3)));
  });

  it("frees the issue when the slow action ends in a refusal", async () => {
    await harness.seed(3);
    const slow = pending();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);
    expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(202);
    slow.finish({ outcome: "refused", refusal: "leased", reason: "held", state: null });
    await vi.waitFor(async () => {
      expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(200);
    });
  });
});
