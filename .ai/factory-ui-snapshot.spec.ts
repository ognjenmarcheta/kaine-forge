import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { docker } from "./factory-docker";
import { github, githubPages } from "./factory-github";
import { FactoryStore } from "./factory-store";
import { githubState, healthState } from "./factory-ui-data";
import { refreshSnapshot } from "./factory-ui-snapshot";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";

vi.mock("./factory", () => ({ currentApproval: vi.fn() }));
vi.mock("./factory-docker", () => ({ docker: vi.fn() }));
vi.mock("./factory-github", () => ({
  github: vi.fn(),
  githubPages: vi.fn(() => []),
  monitoringSnapshot: vi.fn(() => [])
}));
vi.mock("./factory-pilot", () => ({
  pilotFingerprint: () => "current",
  pilotTierSchema: { options: ["docs", "code", "web"] },
  requirePilots: () => {
    throw new Error("Real issue-to-PR trial required");
  }
}));
let store: FactoryStore;
const config = factoryConfigSchema.parse({
  enabled: false,
  repository: "owner/repo",
  owner: "owner",
  image: `sha256:${"a".repeat(64)}`,
  models: { codex: "codex-model", claude: "claude-model" },
  stages: Object.fromEntries(
    ["intake", "spec", "implement", "review", "learn"].map((stage) => [
      stage,
      { provider: "codex", model: "codex-model" }
    ])
  )
});
beforeEach(() => {
  vi.clearAllMocks();
  store = new FactoryStore(mkdtempSync(path.join(tmpdir(), "kaine-ui-snapshot-")));
  vi.mocked(githubPages).mockReturnValue([]);
  vi.mocked(docker).mockReturnValue("linux");
});
afterEach(() => rmSync(store.directory, { recursive: true, force: true }));
function record(pr: string) {
  store.save(
    factoryRunSchema.parse({
      id: randomUUID(),
      issue: 1,
      stage: "implement",
      provider: "codex",
      model: "fixture",
      revision: "a".repeat(40),
      authorization: "owner",
      snapshot: "s",
      startedAt: "now",
      finishedAt: null,
      status: "failed",
      detail: "",
      branch: "",
      pr,
      validation: [],
      result: null,
      invocations: []
    })
  );
}
it("fetches only unique PRs referenced in run history", async () => {
  record("https://github.com/owner/repo/pull/7");
  record("https://github.com/owner/repo/pull/7");
  record("https://github.com/owner/repo/pull/9");
  vi.mocked(github).mockImplementation((endpoint) => ({
    html_url: `https://github.com/owner/repo/pull/${endpoint.split("/").at(-1)}`,
    state: "closed",
    merged_at: "2026-09-28"
  }));
  await refreshSnapshot(config, store);
  expect(
    vi
      .mocked(github)
      .mock.calls.map(([endpoint]) => endpoint)
      .sort()
  ).toEqual(["repos/owner/repo/pulls/7", "repos/owner/repo/pulls/9"]);
  expect(githubPages).toHaveBeenCalledTimes(1);
  expect(Object.values(githubState(store).pulls)).toEqual(["merged", "merged"]);
  const previous = githubState(store);
  vi.mocked(github).mockImplementation(() => {
    throw new Error("PR fetch offline");
  });
  await refreshSnapshot(config, store);
  expect(githubState(store)).toEqual({ ...previous, error: "PR fetch offline" });
});
it.each([
  "https://github.com/other/repo/pull/7",
  "https://github.com/owner/repo/pull/../issues",
  "https://github.com/owner/repo/pull/7?query=1"
])("rejects invalid PR references before issuing requests: %s", async (pr) => {
  record(pr);
  await refreshSnapshot(config, store);
  expect(github).not.toHaveBeenCalled();
  expect(githubState(store).error).toBe("Invalid run pull request reference");
});
it("keeps the last successful GitHub timestamp and marks network failures stale", async () => {
  store.write("ui-github.json", {
    at: "2026-09-01T00:00:00Z",
    error: null,
    issues: [{ number: 4, title: "Earlier issue", group: "waiting", reason: "Owner decision" }],
    pulls: {},
    failures: []
  });
  vi.mocked(githubPages).mockImplementation(() => {
    throw new Error("GitHub offline");
  });
  await refreshSnapshot(config, store);
  expect(githubState(store).at).toBe("2026-09-01T00:00:00Z");
  expect(githubState(store).issues).toHaveLength(1);
  expect(githubState(store).error).toBe("GitHub offline");
});
it("reports Docker failure and expired credentials without claiming a live request passed", async () => {
  vi.mocked(docker).mockImplementation(() => {
    throw new Error("Docker unavailable");
  });
  store.write("doctor.json", {
    at: "2026-09-28T00:00:00Z",
    fingerprint: "current",
    workers: [
      { provider: "claude", isolation: true, authenticated: false, error: "Authentication expired" }
    ]
  });
  await refreshSnapshot(config, store);
  const health = healthState(store);
  expect(health.docker).toBe(false);
  expect(health.workers[0]?.authenticated).toBe(false);
  expect(health.pilots.every((pilot) => !pilot.current)).toBe(true);
  expect(health.rollout).toBe("Real issue-to-PR trial required");
});
it("does not reuse doctor evidence from another configuration", async () => {
  store.write("doctor.json", {
    at: "2026-09-28T00:00:00Z",
    fingerprint: "old",
    workers: [{ provider: "codex", isolation: true, authenticated: true }]
  });
  await refreshSnapshot(config, store);
  expect(healthState(store).workers).toEqual([]);
  expect(healthState(store).at).toBeNull();
});
