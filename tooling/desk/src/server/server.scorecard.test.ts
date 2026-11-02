import { afterEach, describe, expect, it } from "vitest";

import { scorecardViewSchema, type ScorecardView } from "../contracts";
import { authenticated, createHarness, raw, type Harness } from "./server.testing";

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("GET /api/scorecard", () => {
  it("answers with the runtime's view, and only with a session", async () => {
    const view: ScorecardView = {
      state: "invalid",
      ledgerPath: "docs/agents/monorepo-scorecard.md",
      detail: "The scorecard:data JSON is invalid: Unexpected token"
    };
    harness = await createHarness({ scorecard: () => Promise.resolve(view) });
    const api = await authenticated(harness);

    const reply = await api.get("/api/scorecard");

    expect(reply.status).toBe(200);
    expect(scorecardViewSchema.parse(reply.json())).toEqual(view);
    expect((await raw(harness.desk, { path: "/api/scorecard" })).status).toBe(401);
  });

  it("says the ledger is missing when the runtime has no scorecard", async () => {
    harness = await createHarness();
    const api = await authenticated(harness);
    expect((await api.get("/api/scorecard")).json()).toEqual({
      state: "missing",
      ledgerPath: "docs/agents/monorepo-scorecard.md"
    });
  });
});
