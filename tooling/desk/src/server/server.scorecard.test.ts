import { afterEach, describe, expect, it, vi } from "vitest";

import type { ScorecardBackfillResult, TrackedIssue } from "../contracts";
import { authenticated, createHarness, type Api, type Harness } from "./server.testing";

let harness: Harness | null = null;
let api: Api | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  api = null;
});

const tracked = (number: number, labeled: boolean): TrackedIssue => ({
  number,
  title: `Issue ${String(number)}`,
  url: `https://github.com/o/r/issues/${String(number)}`,
  state: "open",
  createdAt: "2026-11-01T10:00:00Z",
  closedAt: null,
  labeled,
  slug: null,
  fix: null,
  run: null
});

const open = async (
  scorecardTracking: () => Promise<TrackedIssue[]>,
  scorecardBackfill?: (issues: readonly number[]) => Promise<ScorecardBackfillResult>
): Promise<Api> => {
  harness = await createHarness({ scorecardTracking, scorecardBackfill });
  api = await authenticated(harness);
  return api;
};

describe("GET /api/scorecard/tracking", () => {
  it("reads GitHub once a minute at most, and again on refresh", async () => {
    const read = vi.fn(() => Promise.resolve([tracked(848, false)]));
    const client = await open(read);

    expect((await client.get("/api/scorecard/tracking")).json()).toMatchObject({
      ok: true,
      issues: [{ number: 848 }]
    });
    await client.get("/api/scorecard/tracking");
    expect(read).toHaveBeenCalledTimes(1);
    await client.get("/api/scorecard/tracking?refresh=1");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("says why when GitHub could not be read", async () => {
    const client = await open(() => Promise.reject(new Error("gh: not logged in")));
    expect((await client.get("/api/scorecard/tracking")).json()).toMatchObject({
      ok: false,
      reason: "gh: not logged in"
    });
  });
});

describe("POST /api/scorecard/backfill", () => {
  const backfill = vi.fn((issues: readonly number[]) =>
    Promise.resolve({ results: issues.map((number) => ({ number, ok: true, detail: null })) })
  );
  afterEach(() => backfill.mockClear());

  it("labels only tracked issues without the label, and only with confirm: true", async () => {
    const client = await open(
      () => Promise.resolve([tracked(848, false), tracked(847, true)]),
      backfill
    );

    expect((await client.post("/api/scorecard/backfill", { issues: [848] })).status).toBe(400);
    // #847 has the label already; #12 is not a scorecard issue.
    for (const issues of [[847], [12], [848, 12]]) {
      expect((await client.post("/api/scorecard/backfill", { issues, confirm: true })).status).toBe(
        400
      );
    }
    expect(backfill).not.toHaveBeenCalled();

    const done = await client.post("/api/scorecard/backfill", { issues: [848], confirm: true });
    expect(done.status).toBe(200);
    expect(backfill).toHaveBeenCalledWith([848]);
  });
});
