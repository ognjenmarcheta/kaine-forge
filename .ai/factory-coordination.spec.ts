import { actionSchema, stateSchema } from "@repo/factory-ui/contracts";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  commonDirectory,
  discoverCheckouts,
  resolveCheckout,
  checkoutId
} from "./factory-checkouts";
import { readOptional } from "./factory-files";
import { FactoryStore } from "./factory-store";
import { createDashboard } from "./factory-ui";
import { DashboardActions } from "./factory-ui-actions";
import { factoryRunSchema, factoryConfigSchema } from "./factory.util";

let folder: string;
vi.mock("./factory-files", async (original) => {
  const actual = await original<typeof import("./factory-files")>();
  return { ...actual, readOptional: vi.fn(actual.readOptional) };
});
let roots: string[];
let dashboard: Awaited<ReturnType<typeof createDashboard>> | undefined;
const git = (root: string, args: string[]) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
const record = (id: string) =>
  factoryRunSchema.parse({
    id,
    issue: 450,
    stage: "implement",
    provider: "codex",
    model: "fixture",
    revision: "a".repeat(40),
    authorization: "owner-decision",
    snapshot: "s",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    detail: "",
    branch: "KAINE-450-feat-factory",
    pr: null,
    validation: [],
    result: null,
    invocations: []
  });
beforeEach(() => {
  // Git prints real paths; macOS tmpdir() is a symlink, so compare real paths only.
  folder = realpathSync(mkdtempSync(path.join(tmpdir(), "factory-coordination-test-")));
  git(folder, ["init"]);
  git(folder, ["config", "user.name", "Test Owner"]);
  git(folder, ["config", "user.email", "owner@example.com"]);
  git(folder, ["commit", "--allow-empty", "-m", "test: initialize fixture"]);
  roots = [folder, path.join(folder, "second"), path.join(folder, "third")];
  git(folder, ["worktree", "add", "-b", "test-second", roots[1] ?? ""]);
  git(folder, ["worktree", "add", "-b", "test-third", roots[2] ?? ""]);
});
afterEach(async () => {
  await dashboard?.close();
  dashboard = undefined;
  vi.restoreAllMocks();
  if (!path.dirname(folder).startsWith(realpathSync(tmpdir())))
    throw new Error("Unsafe test cleanup");
  rmSync(folder, { recursive: true, force: true });
});

it("serves both worktrees, keeps malformed history visible, and persists action keys repository-wide", async () => {
  const config = factoryConfigSchema.parse({
    enabled: false,
    repository: "owner/project",
    owner: "owner",
    image: `sha256:${"a".repeat(64)}`,
    models: { codex: "fixture", claude: "fixture" },
    stages: Object.fromEntries(
      ["intake", "spec", "implement", "review", "learn"].map((stage) => [
        stage,
        { provider: "codex", model: "fixture" }
      ])
    )
  });
  for (const index of [0, 1]) {
    const target = store(index);
    writeFileSync(path.join(target.directory, "../config.json"), JSON.stringify(config));
    const run = record(randomUUID());
    run.status = "failed";
    target.save(run);
  }
  writeFileSync(store(1).file(`${randomUUID()}.json`), "{incomplete");
  const start = vi.spyOn(DashboardActions.prototype, "start").mockImplementation((request) => {
    const root = roots.find((entry) => checkoutId(entry) === request.worktreeId);
    if (!root) throw new Error("Unexpected worktree");
    const target = new FactoryStore(path.join(root, ".ai.local/factory/runs"));
    const action = actionSchema.parse({
      id: request.key,
      request,
      state: "completed",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      runId: null,
      detail: "Fixture action"
    });
    target.write(`action-${action.id}.json`, JSON.parse(JSON.stringify(action)));
    return action;
  });
  dashboard = await createDashboard(folder);
  const launch = new URL(dashboard.url);
  const authenticated = await fetch(`${launch.origin}/api/session`, {
    method: "POST",
    headers: { Origin: launch.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: new URLSearchParams(launch.hash.slice(1)).get("session") })
  });
  const cookie = authenticated.headers.get("set-cookie")?.split(";")[0] ?? "";
  const headers = { Origin: launch.origin, "Content-Type": "application/json", Cookie: cookie };
  const response = await fetch(`${launch.origin}/api/state`, { headers });
  const state = stateSchema.parse(await response.json());
  expect(state.runs).toHaveLength(2);
  expect(new Set(state.runs.map((run) => run.worktreeId)).size).toBe(2);
  expect(state.warnings.some((warning) => warning.includes("Unreadable run"))).toBe(true);
  const request = { key: randomUUID(), kind: "doctor", worktreeId: checkoutId(folder) };
  const post = (value: typeof request) =>
    fetch(`${launch.origin}/api/actions`, { method: "POST", headers, body: JSON.stringify(value) });
  expect((await post(request)).status).toBe(202);
  expect((await post(request)).status).toBe(202);
  expect(start).toHaveBeenCalledTimes(1);
  expect((await post({ ...request, worktreeId: checkoutId(roots[1] ?? "") })).status).toBe(400);
  expect((await post({ ...request, key: randomUUID(), worktreeId: folder })).status).toBe(400);
  expect(start).toHaveBeenCalledTimes(1);
});
function store(index: number) {
  const root = roots[index];
  if (!root) throw new Error("Fixture worktree missing");
  return new FactoryStore(path.join(root, ".ai.local/factory/runs"), root);
}
it("discovers linked worktrees and rejects a client path as an identifier", () => {
  expect(discoverCheckouts(folder)).toHaveLength(3);
  expect(resolveCheckout(folder, checkoutId(folder)).path).toBe(folder);
  expect(() => resolveCheckout(folder, "../../outside")).toThrow("unavailable");
});
it("allows two distinct issues but rejects a third run and a competing issue", () => {
  const one = store(0),
    two = store(1),
    three = store(2);
  const releaseOne = one.acquire(randomUUID(), "owner/project:450");
  expect(() => two.acquire(randomUUID(), "owner/project:450")).toThrow("already has");
  const releaseTwo = two.acquire(randomUUID(), "owner/project:451");
  expect(() => three.acquire(randomUUID(), "owner/project:452")).toThrow("slots");
  releaseTwo();
  releaseOne();
  const releaseThree = three.acquire(randomUUID(), "owner/project:452");
  releaseThree();
});
it("blocks parallel admission while an old checkout has a legacy lock", () => {
  const one = store(0),
    two = store(1);
  one.write("active.json", { id: randomUUID(), pid: process.pid });
  expect(() => two.acquire(randomUUID(), "owner/project:450")).toThrow("legacy");
});
it("shares resource waits and lets cancellation interrupt a waiting run", async () => {
  const one = store(0),
    two = store(1);
  const a = record(randomUUID()),
    b = record(randomUUID());
  const endA = one.acquire(a.id, "owner/project:450"),
    endB = two.acquire(b.id, "owner/project:451");
  const resource = await one.resource("validation", a);
  const waiting = two.resource("validation", b);
  expect(b.waiting).toBe("validation");
  two.cancel(b.id);
  await expect(waiting).rejects.toThrow("cancelled");
  resource();
  endA();
  endB();
});
it("keeps completed owner decisions shared after their worktree history is removed", () => {
  const one = store(0),
    two = store(1);
  const run = record(randomUUID());
  run.status = "completed";
  one.save(run);
  one.coordination?.record("owner/project", run);
  rmSync(one.file(`${run.id}.json`));
  expect(two.coordination?.completed("owner/project", run)).toBe(true);
  expect(existsSync(path.join(commonDirectory(folder), "kaine-factory"))).toBe(true);
});
it("does not let recovery remove a live controller's lease", () => {
  const one = store(0);
  const id = randomUUID();
  const release = one.acquire(id, "owner/project:450");
  expect(() => one.coordination?.recover(id)).toThrow("still active");
  release();
});
it("tolerates a lease disappearing during concurrent release and rejects malformed ownership", async () => {
  const one = store(0);
  const id = randomUUID();
  const release = one.acquire(id);
  const actual = await vi.importActual<typeof import("./factory-files")>("./factory-files");
  vi.mocked(readOptional).mockImplementationOnce((file) => {
    rmSync(file);
    return actual.readOptional(file);
  });
  expect(() => one.coordination?.release(id)).not.toThrow();
  release();
  const directory = one.coordination?.directory;
  if (!directory) throw new Error("Missing coordination");
  const malformed = path.join(directory, `${randomUUID()}.resource.json`);
  writeFileSync(malformed, "{partial");
  expect(() => one.coordination?.release(id)).toThrow();
  expect(existsSync(malformed)).toBe(true);
});
