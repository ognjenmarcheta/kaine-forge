import { afterEach, describe, expect, it } from "vitest";

import { jobListSchema, type JobState } from "../contracts";
import { JobRefusal, type JobManager } from "../jobs";
import { WRITE_HEADERS, authenticated, createHarness, raw, type Harness } from "./server.testing";

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

const job: JobState = {
  schema: 1,
  id: 3,
  kind: "scorecard",
  createdAt: "2026-11-02T12:00:00.000Z",
  updatedAt: "2026-11-02T12:00:00.000Z",
  input: { note: "", model: "opus", budgetUsd: 15, minutes: 60 },
  status: "waiting",
  stage: "review",
  stop: null,
  branch: "KAINE-chore-scorecard-2026-11-02-job-3",
  worktree: "/worktrees/KAINE-job-3",
  spentUsd: 4,
  feedback: [],
  history: [],
  result: null,
  screen: null,
  approvedIssues: [],
  filedIssues: [],
  pr: null
};

/** A job manager that answers from fixed data and records what it was asked. */
const fakeJobs = (calls: unknown[]): JobManager => ({
  subscribe: () => () => undefined,
  list: () => Promise.resolve([job]),
  get: (id) => Promise.resolve(id === job.id ? job : null),
  start: (request) => {
    calls.push(request);
    return Promise.resolve(job);
  },
  act: (id, action) => {
    calls.push(action);
    if (action.action === "continue") {
      return Promise.reject(
        new JobRefusal("invalid-transition", "Only a stopped job can continue.")
      );
    }
    return Promise.resolve(id === job.id ? job : null);
  },
  recover: () => Promise.resolve(),
  settled: () => Promise.resolve(),
  close: () => Promise.resolve()
});

describe("job routes", () => {
  it("start, list, and act on jobs, and answer a refusal with its code", async () => {
    const calls: unknown[] = [];
    harness = await createHarness({ jobs: fakeJobs(calls) });
    const api = await authenticated(harness);

    expect((await api.post("/api/jobs", { kind: "scorecard", budgetUsd: 9 })).status).toBe(201);
    expect(jobListSchema.parse((await api.get("/api/jobs")).json())).toHaveLength(1);
    expect((await api.get("/api/jobs/4")).status).toBe(404);
    const refused = await api.post("/api/jobs/3/actions", { action: "continue" });
    expect(refused.status).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: "invalid-transition" } });
    expect(calls).toEqual([{ kind: "scorecard", budgetUsd: 9 }, { action: "continue" }]);
  });

  it("refuses an approval without the confirmation and a job route without a session", async () => {
    harness = await createHarness({ jobs: fakeJobs([]) });
    const api = await authenticated(harness);
    const unconfirmed = await api.post("/api/jobs/3/actions", { action: "approve", issues: [] });
    expect(unconfirmed.status).toBe(400);
    for (const target of ["/api/jobs", "/api/jobs/3"]) {
      expect((await raw(harness.desk, { path: target })).status, target).toBe(401);
    }
    expect(
      (
        await raw(harness.desk, {
          path: "/api/jobs",
          method: "POST",
          headers: WRITE_HEADERS(harness.desk),
          body: "{}"
        })
      ).status
    ).toBe(401);
  });

  it("previews the scorecard of a job's worktree, and only of a job that has one", async () => {
    const asked: (string | undefined)[] = [];
    harness = await createHarness({
      jobs: fakeJobs([]),
      scorecard: (checkout) => {
        asked.push(checkout);
        return Promise.resolve({
          state: "missing",
          ledgerPath: "docs/agents/monorepo-scorecard.md"
        });
      }
    });
    const api = await authenticated(harness);

    expect((await api.get("/api/scorecard?job=3")).status).toBe(200);
    expect((await api.get("/api/scorecard?job=9")).status).toBe(404);
    expect((await api.get("/api/scorecard?job=../x")).status).toBe(400);
    expect(asked).toEqual(["/worktrees/KAINE-job-3"]);
  });

  it("lists no job on a desk without jobs, and refuses to start one there", async () => {
    harness = await createHarness();
    const api = await authenticated(harness);
    expect((await api.get("/api/jobs")).json()).toEqual([]);
    expect((await api.post("/api/jobs", { kind: "scorecard" })).status).toBe(404);
  });
});
