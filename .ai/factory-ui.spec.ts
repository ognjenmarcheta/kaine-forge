import { stateSchema, logSchema } from "@repo/factory-ui/contracts";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { containedFile, events, progress, redact, registerArtifact } from "./factory-progress";
import { FactoryStore } from "./factory-store";
import { createDashboard } from "./factory-ui";
import { readHistory, runDetail, summarizeRun } from "./factory-ui-data";
import { factoryConfigSchema, type FactoryRun } from "./factory.util";

let root: string;
let store: FactoryStore;
let dashboard: Awaited<ReturnType<typeof createDashboard>> | undefined;
const fixture = (): FactoryRun => ({
  id: randomUUID(),
  issue: 23,
  stage: "implement",
  provider: "codex",
  model: "fixture-model",
  revision: "a".repeat(40),
  authorization: "owner",
  snapshot: "snapshot",
  startedAt: "2026-09-28T00:00:00Z",
  finishedAt: null,
  status: "running",
  detail: "",
  branch: "KAINE-23-feat-factory",
  pr: null,
  validation: [],
  result: null,
  invocations: []
});
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "kaine-dashboard-"));
  store = new FactoryStore(path.join(root, ".ai.local/factory/runs"));
  const config = factoryConfigSchema.parse({
    enabled: false,
    repository: "owner/project",
    owner: "owner",
    image: `sha256:${"a".repeat(64)}`,
    watch: false,
    models: { codex: "codex-test", claude: "claude-test" },
    stages: Object.fromEntries(
      ["intake", "spec", "implement", "review", "learn"].map((stage) => [
        stage,
        { provider: "codex", model: "codex-test" }
      ])
    )
  });
  writeFileSync(path.join(root, ".ai.local/factory/config.json"), JSON.stringify(config));
  mkdirSync(path.join(root, "tooling/factory-ui/dist"), { recursive: true });
  writeFileSync(
    path.join(root, "tooling/factory-ui/dist/index.html"),
    "<!doctype html><title>Fixture</title>"
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await dashboard?.close();
  dashboard = undefined;
  // Test-created directories only; never touch a checkout or local factory state.
  rmSync(root, { recursive: true, force: true });
});
async function authenticate() {
  dashboard = await createDashboard(root);
  const launch = new URL(dashboard.url);
  const origin = launch.origin;
  const token = new URLSearchParams(launch.hash.slice(1)).get("session");
  const response = await fetch(`${origin}/api/session`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
  return { origin, token, cookie };
}
describe("dashboard session boundary", () => {
  it("binds loopback, requires a session, and exchanges a fragment token only once", async () => {
    const { origin, token, cookie } = await authenticate();
    expect(new URL(origin).hostname).toBe("127.0.0.1");
    expect((await fetch(`${origin}/api/state`)).status).toBe(401);
    expect((await fetch(`${origin}/api/state`, { headers: { Cookie: cookie } })).status).toBe(200);
    expect(
      (
        await fetch(`${origin}/api/session`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        })
      ).status
    ).toBe(403);
    const html = await fetch(origin);
    expect(await html.text()).not.toContain(token);
    expect(html.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it("rejects cross-origin writes, missing Origin, hostile Host, and arbitrary commands", async () => {
    const { origin, cookie } = await authenticate();
    for (const headers of [
      { Cookie: cookie },
      { Cookie: cookie, Origin: "https://evil.example" }
    ]) {
      const response = await fetch(`${origin}/api/actions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ key: randomUUID(), kind: "doctor" })
      });
      expect(response.status).toBe(403);
    }
    const hostile = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(
        `${origin}/api/state`,
        { headers: { Host: "evil.example", Cookie: cookie } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        }
      );
      request.on("error", reject);
      request.end();
    });
    expect(hostile).toBe(403);
    expect(
      (
        await fetch(`${origin}/api/actions`, {
          method: "POST",
          headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ key: randomUUID(), kind: "shell", command: "git push" })
        })
      ).status
    ).toBe(400);
  });
  it("paginates ordinary history, isolates pilots, and excludes raw proposals and credentials", async () => {
    for (let index = 0; index < 28; index++) {
      const run = fixture();
      run.status = "completed";
      run.finishedAt = run.startedAt;
      run.detail = "token=credential-value";
      if (index === 0) run.authorization = "local-pilot";
      store.save(run);
    }
    writeFileSync(store.file(`${randomUUID()}.json`), "{broken");
    const { origin, cookie } = await authenticate();
    const response = await fetch(`${origin}/api/state`, { headers: { Cookie: cookie } });
    const text = await response.text();
    const state = stateSchema.parse(JSON.parse(text));
    expect(state.total).toBe(27);
    expect(state.runs).toHaveLength(25);
    expect(state.warnings).toHaveLength(1);
    expect(text).not.toContain("credential-value");
    expect(text).not.toContain('"snapshot"');
    const pilots = stateSchema.parse(
      await (await fetch(`${origin}/api/state?pilots=true`, { headers: { Cookie: cookie } })).json()
    );
    expect(pilots.total).toBe(1);
    const second = stateSchema.parse(
      await (await fetch(`${origin}/api/state?page=1`, { headers: { Cookie: cookie } })).json()
    );
    expect(second.runs).toHaveLength(2);
  });
  it("serves bounded redacted logs and forces active HTML to download", async () => {
    const run = fixture();
    store.save(run);
    const logFile = store.file(`${run.id}.check-0.log`);
    writeFileSync(
      logFile,
      "x".repeat(40000) + "\nAuthorization: Bearer private-secret\npassword=private-password"
    );
    const logId = registerArtifact(store, run.id, logFile);
    const report = store.file("report.html");
    writeFileSync(report, "<script>alert(1)</script>");
    const reportId = registerArtifact(store, run.id, report);
    const { origin, cookie } = await authenticate();
    const response = await fetch(`${origin}/api/artifacts/${run.id}/${logId}`, {
      headers: { Cookie: cookie }
    });
    const output = logSchema.parse(await response.json());
    expect(output.truncated).toBe(true);
    expect(output.text).not.toContain("private-secret");
    expect(output.text).not.toContain("private-password");
    const html = await fetch(`${origin}/api/artifacts/${run.id}/${reportId}`, {
      headers: { Cookie: cookie }
    });
    expect(html.headers.get("content-disposition")).toContain("attachment");
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(
      (
        await fetch(`${origin}/api/artifacts/${run.id}/${randomUUID()}`, {
          headers: { Cookie: cookie }
        })
      ).status
    ).toBe(404);
  });
});
describe("progress and history", () => {
  it("does not reassign a run when a later cancel action saves it", () => {
    const run = fixture();
    const ownerAction = randomUUID();
    vi.stubEnv("KAINE_FACTORY_ACTION_ID", ownerAction);
    store.save(run);
    vi.stubEnv("KAINE_FACTORY_ACTION_ID", randomUUID());
    store.save(run);
    expect(readHistory(store).runs[0]?.actionId).toBe(ownerAction);
  });
  it("retains human acceptance after the human replaces the report note", () => {
    const run = fixture();
    run.status = "completed";
    store.save(run);
    const reports = path.join(store.directory, "..", "reports");
    mkdirSync(reports);
    writeFileSync(
      path.join(reports, `${randomUUID()}.json`),
      JSON.stringify({
        schemaVersion: 2,
        runId: randomUUID(),
        factoryRunId: run.id,
        workspace: root,
        revision: run.revision,
        model: run.model,
        cliVersion: "fixture",
        configurationHash: "hash",
        startedAt: run.startedAt,
        durationMs: 100,
        exitCode: 0,
        termination: "completed",
        commands: [],
        transcript: null,
        outcome: "accepted",
        reviewMinutes: 7,
        note: "Owner reviewed behavior"
      })
    );
    const summary = summarizeRun(store, run);
    expect(summary.acceptance).toBe("accepted");
    expect(summary.reviewMinutes).toBe(7);
    expect(summary.merge).toBe("unavailable");
  });
  it("keeps legacy records readable without inventing timing, acceptance, or usage", () => {
    const run = fixture();
    run.status = "completed";
    store.save(run);
    const detail = runDetail(store, run);
    expect(detail.lastActivity).toBeNull();
    expect(detail.acceptance).toBeNull();
    expect(detail.merge).toBe("unavailable");
    expect(detail.invocations).toEqual([]);
    expect(detail.warnings).toContain("Historical phase timing is unavailable");
  });
  it("records failed checks and a repair without changing execution into human approval", () => {
    const run = fixture();
    run.status = "completed";
    run.validation = [
      { command: "test", passed: false, artifact: "first.log" },
      { command: "test", passed: true, artifact: "second.log" }
    ];
    progress(store, run.id, "validation", "failed");
    progress(store, run.id, "repair", "started");
    progress(store, run.id, "repair", "passed");
    progress(store, run.id, "publication", "passed");
    const detail = runDetail(store, run);
    expect(detail.events.map((event) => event.phase)).toEqual([
      "validation",
      "repair",
      "repair",
      "publication"
    ]);
    expect(detail.validation).toBe("passed");
    expect(detail.checks[0]?.passed).toBe(false);
    expect(detail.acceptance).toBeNull();
  });
  it("reports interrupted controllers and malformed journal rows without hiding healthy events", () => {
    const run = fixture();
    store.save(run);
    progress(store, run.id, "preflight", "passed");
    appendFileSync(store.file(`${run.id}.events.jsonl`), "{incomplete");
    expect(summarizeRun(store, run).status).toBe("interrupted");
    expect(events(store, run.id).events).toHaveLength(1);
    expect(events(store, run.id).warnings).toHaveLength(1);
    expect(readHistory(store).runs).toHaveLength(1);
  });
  it("rejects traversal and junction artifacts and reports removed evidence", () => {
    const run = fixture();
    const file = store.file("safe.log");
    writeFileSync(file, "evidence");
    const id = registerArtifact(store, run.id, file);
    expect(id).toBeTruthy();
    expect(() => containedFile(root, "../outside")).toThrow();
    expect(() => containedFile(root, "C:/outside")).toThrow();
    symlinkSync(store.directory, path.join(root, "linked"), "junction");
    expect(() => containedFile(root, "linked/safe.log")).toThrow("Symlink");
    rmSync(file);
    expect(runDetail(store, run).warnings).toContain("Artifact unavailable: safe.log");
  });
  it("redacts provider tokens, cookies and URL credentials", () => {
    expect(
      redact(
        "Bearer abc123 cookie=session123 https://user:pass@example.com/test?token=123 ghp_abc123 sk-secret123"
      )
    ).not.toMatch(/abc123|session123|user:pass|token=123|sk-secret123/);
  });
  it("keeps independent review current after its temporary storage cleanup finishes", () => {
    const run = fixture();
    const release = store.acquire(run.id);
    store.save(run);
    progress(store, run.id, "review", "started");
    progress(store, run.id, "cleanup", "started");
    progress(store, run.id, "cleanup", "passed");
    expect(summarizeRun(store, run).phase).toBe("review");
    release();
  });
});
