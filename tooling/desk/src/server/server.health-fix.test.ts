import { afterEach, describe, expect, it, vi } from "vitest";

import { healthReportSchema } from "../contracts";
import type { HealthFixOutcome } from "./server.http";
import {
  authenticated,
  createHarness,
  deferred,
  openEvents,
  raw,
  WRITE_HEADERS,
  type Harness
} from "./server.testing";

let harness: Harness | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("health checks with a remedy", () => {
  it("carries the command to copy and the repair the desk can run", async () => {
    harness = await createHarness({ healthTtlMs: 0 });
    harness.health.mockResolvedValue({
      ok: false,
      checks: [
        { id: "node", label: "Node.js", status: "ok", detail: "v22.0.0" },
        {
          id: "docker-image",
          label: "Docker image",
          status: "warn",
          detail: "not built",
          command: "pnpm desk docker build",
          fix: "docker-build"
        }
      ]
    });
    const api = await authenticated(harness);

    const report = healthReportSchema.parse((await api.get("/api/health")).json());

    expect(report.checks.map((check) => [check.id, check.command, check.fix])).toEqual([
      ["node", null, null],
      ["docker-image", "pnpm desk docker build", "docker-build"]
    ]);
  });
});

describe("POST /api/health/fix", () => {
  it("runs the repair once, reports how it ended, and checks again", async () => {
    const build = deferred<HealthFixOutcome>();
    const repair = vi.fn(() => build.promise);
    harness = await createHarness({ healthTtlMs: 60_000, healthFixes: { "docker-build": repair } });
    const api = await authenticated(harness);
    await api.get("/api/health");
    const events = await openEvents(harness.desk, api.cookie);

    const first = await api.post("/api/health/fix", { fix: "docker-build" });
    const second = await api.post("/api/health/fix", { fix: "docker-build" });
    build.resolve({ ok: true, detail: "Built kaine-desk-worker:abc." });

    expect(first.status).toBe(202);
    expect(first.json()).toEqual({ fix: "docker-build", status: "running" });
    expect(second.status).toBe(409);
    expect(repair).toHaveBeenCalledTimes(1);
    const ended = await events.next((frame) => frame.event === "health-fix");
    expect(ended.data).toEqual({
      type: "health-fix",
      result: { fix: "docker-build", ok: true, detail: "Built kaine-desk-worker:abc." }
    });
    // The cache is dropped, so the doctor runs again although its time is not up.
    await events.next((frame) => frame.event === "health");
    expect(harness.health).toHaveBeenCalledTimes(2);
    events.close();
  });

  it("reports a repair that throws as failed and frees the slot", async () => {
    const repair = vi
      .fn<() => Promise<HealthFixOutcome>>()
      .mockRejectedValueOnce(new Error("docker build failed"))
      .mockResolvedValue({ ok: true, detail: "Built." });
    harness = await createHarness({ healthFixes: { "docker-build": repair } });
    const api = await authenticated(harness);
    const events = await openEvents(harness.desk, api.cookie);

    await api.post("/api/health/fix", { fix: "docker-build" });
    const failed = await events.next((frame) => frame.event === "health-fix");

    expect(failed.data).toMatchObject({ result: { ok: false, detail: "docker build failed" } });
    expect((await api.post("/api/health/fix", { fix: "docker-build" })).status).toBe(202);
    events.close();
  });

  it("refuses a repair this desk cannot run, an unknown name, and a request without a session", async () => {
    harness = await createHarness();
    const api = await authenticated(harness);
    expect((await api.post("/api/health/fix", { fix: "docker-build" })).status).toBe(404);
    expect((await api.post("/api/health/fix", { fix: "rm -rf /" })).status).toBe(400);
    const anonymous = await raw(harness.desk, {
      method: "POST",
      path: "/api/health/fix",
      headers: WRITE_HEADERS(harness.desk),
      body: JSON.stringify({ fix: "docker-build" })
    });
    expect(anonymous.status).toBe(401);
  });
});
