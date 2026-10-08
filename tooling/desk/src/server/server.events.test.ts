import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serverEventSchema, type ServerEvent } from "../contracts";
import { createEventBus, createLogBuffer } from "./server.events";
import {
  authenticated,
  createHarness,
  deferred,
  makeState,
  openEvents,
  raw,
  stoppedAt,
  trackIntervals,
  type Api,
  type Harness,
  type SseClient
} from "./server.testing";

let harness: Harness;
let api: Api;
const clients: SseClient[] = [];

const connect = async (
  target: Harness = harness,
  cookie: string = api.cookie
): Promise<SseClient> => {
  const client = await openEvents(target.desk, cookie);
  clients.push(client);
  await client.next((frame) => frame.raw.startsWith(": connected"));
  return client;
};

const nextEvent = async (
  client: SseClient,
  type: string,
  timeoutMs?: number
): Promise<ServerEvent> => {
  const frame = await client.next((candidate) => candidate.event === type, timeoutMs);
  return serverEventSchema.parse(frame.data);
};

beforeEach(async () => {
  harness = await createHarness();
  api = await authenticated(harness);
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await harness.cleanup();
});

describe("GET /api/events", () => {
  it("needs the session cookie", async () => {
    const reply = await raw(harness.desk, { path: "/api/events" });
    expect(reply.status).toBe(401);
  });

  it("opens an event stream with the security headers", async () => {
    const client = await connect();
    expect(client.status).toBe(200);
    expect(client.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(client.headers["cache-control"]).toBe("no-store");
    expect(client.headers["x-content-type-options"]).toBe("nosniff");
    expect(client.headers["content-security-policy"]).toContain("default-src 'self'");
  });

  it("sends a heartbeat comment", async () => {
    const beating = await createHarness({ heartbeatMs: 20 });
    try {
      const beatingApi = await authenticated(beating);
      const client = await connect(beating, beatingApi.cookie);
      await client.next((frame) => frame.raw === ": ping");
    } finally {
      await beating.cleanup();
    }
  });

  it("delivers a runner state event as issue-updated", async () => {
    const state = await harness.seed(3, { stage: "build", status: "running" });
    const client = await connect();
    harness.bus.emit({ type: "state", issue: 3, state });
    const event = await nextEvent(client, "issue-updated");
    expect(event).toMatchObject({
      type: "issue-updated",
      summary: { readable: true, issueNumber: 3, stage: "build", status: "running" }
    });
  });

  it("delivers runner log, history and agent events as log entries", async () => {
    await harness.seed(3);
    const client = await connect();
    harness.bus.emit({ type: "log", issue: 3, message: "setting up" });
    harness.bus.emit({
      type: "agent",
      issue: 3,
      role: "builder",
      event: { type: "tool_call", id: "t1", tool: "Bash", command: "pnpm test", paths: [] }
    });
    harness.bus.emit({
      type: "history",
      issue: 3,
      event: { at: "2026-03-01T10:00:00.000Z", stage: "build", event: "stage-started" }
    });
    const entries: { kind: string; text: string; at: string }[] = [];
    for (let seen = 0; seen < 3; seen += 1) {
      const event = await nextEvent(client, "log");
      if (event.type === "log") entries.push(event.entry);
    }
    expect(entries.map((entry) => entry.kind)).toEqual(["log", "agent", "history"]);
    // The time travels in `at`, so the page can show it in the reader's zone. The text has none.
    expect(entries.map((entry) => entry.text)).toEqual([
      "setting up",
      "[builder] Bash pnpm test",
      "build: stage-started"
    ]);
    expect(entries[2]?.at).toBe("2026-03-01T10:00:00.000Z");
  });

  it("numbers log entries in order", async () => {
    await harness.seed(3);
    const client = await connect();
    harness.bus.emit({ type: "log", issue: 3, message: "one" });
    harness.bus.emit({ type: "log", issue: 3, message: "two" });
    const first = await nextEvent(client, "log");
    const second = await nextEvent(client, "log");
    expect(
      first.type === "log" && second.type === "log" && second.entry.seq > first.entry.seq
    ).toBe(true);
  });

  it("notices a change made outside the server (a CLI run) by watching the store", async () => {
    const client = await connect();
    // Written straight to the store, as `pnpm desk approve` in another terminal does.
    await harness.seed(8, { stage: "build", status: "running" });
    const created = await nextEvent(client, "issue-updated");
    expect(created).toMatchObject({ summary: { issueNumber: 8, stage: "build" } });

    await harness.seed(8, {
      stage: "check",
      status: "running",
      updatedAt: "2026-03-01T10:05:00.000Z"
    });
    const changed = await nextEvent(client, "issue-updated");
    expect(changed).toMatchObject({ summary: { issueNumber: 8, stage: "check" } });
  });

  it("reports an issue that disappeared from the store", async () => {
    await harness.seed(8);
    const client = await connect();
    await rm(harness.store.issueDir(8), { recursive: true });
    const event = await nextEvent(client, "issue-removed");
    expect(event).toEqual({ type: "issue-removed", issueNumber: 8 });
  });

  it("reports an issue whose state became unreadable", async () => {
    await harness.seed(8);
    const client = await connect();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(harness.store.statePath(8), "{broken");
    const event = await nextEvent(client, "issue-updated");
    expect(event).toMatchObject({ summary: { readable: false, issueNumber: 8 } });
  });

  it("publishes health when the doctor runs", async () => {
    const client = await connect();
    await api.get("/api/health");
    const event = await nextEvent(client, "health");
    expect(event).toMatchObject({ type: "health", report: { ok: true } });
  });

  it("sends the result of a slow action as action-result and then frees the issue", async () => {
    await harness.seed(3);
    const slow = deferred<Awaited<ReturnType<typeof harness.runner.approvePlan>>>();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);
    const client = await connect();

    expect((await api.post("/api/issues/3/actions", { action: "approve" })).status).toBe(202);
    const busy = await nextEvent(client, "issue-updated");
    expect(busy).toMatchObject({ summary: { issueNumber: 3, busy: true } });

    slow.resolve(stoppedAt(makeState(3, { stage: "build" }), "Builder done"));
    const result = await nextEvent(client, "action-result");
    expect(result).toEqual({
      type: "action-result",
      issueNumber: 3,
      action: "approve",
      outcome: { stop: "gate", stage: "build", message: "Builder done" },
      error: null
    });
  });

  it("sends a late refusal as action-result with its code", async () => {
    await harness.seed(3);
    const slow = deferred<Awaited<ReturnType<typeof harness.runner.approvePlan>>>();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);
    const client = await connect();
    await api.post("/api/issues/3/actions", { action: "approve" });
    slow.resolve({ outcome: "refused", refusal: "leased", reason: "held by pid 4", state: null });
    const result = await nextEvent(client, "action-result");
    expect(result).toMatchObject({
      outcome: null,
      error: { code: "leased", detail: "held by pid 4" }
    });
  });

  it("sends a late runner failure as an internal error without its message", async () => {
    await harness.seed(3);
    const slow = deferred<Awaited<ReturnType<typeof harness.runner.approvePlan>>>();
    harness.runner.approvePlan.mockReturnValueOnce(slow.promise);
    const client = await connect();
    await api.post("/api/issues/3/actions", { action: "approve" });
    slow.reject(new Error("boom /private/path"));
    const result = await nextEvent(client, "action-result");
    expect(result).toMatchObject({
      outcome: null,
      error: { code: "internal", detail: null }
    });
    expect(JSON.stringify(result)).not.toContain("/private/path");
  });

  it("serves several clients", async () => {
    await harness.seed(3);
    const first = await connect();
    const second = await connect();
    harness.bus.emit({ type: "log", issue: 3, message: "to all" });
    await nextEvent(first, "log");
    await nextEvent(second, "log");
  });
});

describe("shutdown", () => {
  it("closes open event streams and releases every interval", async () => {
    const intervals = trackIntervals();
    try {
      const local = await createHarness({ heartbeatMs: 20 });
      const localApi = await authenticated(local);
      const client = await openEvents(local.desk, localApi.cookie);
      await client.next((frame) => frame.raw.startsWith(": connected"));
      await client.next((frame) => frame.raw === ": ping");
      // The heartbeat and the store poll run for the connected client.
      expect(intervals.active()).toBeGreaterThanOrEqual(2);

      await local.cleanup();
      await client.closed;
      expect(intervals.active()).toBe(0);
    } finally {
      intervals.restore();
    }
  });

  it("holds no interval once the last client left", async () => {
    const intervals = trackIntervals();
    try {
      const local = await createHarness({ heartbeatMs: 20 });
      const localApi = await authenticated(local);
      const client = await openEvents(local.desk, localApi.cookie);
      await client.next((frame) => frame.raw.startsWith(": connected"));
      expect(intervals.active()).toBeGreaterThanOrEqual(2);
      client.close();
      await client.closed;
      await vi.waitFor(() => expect(intervals.active()).toBe(0));
      await local.cleanup();
    } finally {
      intervals.restore();
    }
  });

  it("can be closed twice", async () => {
    const twice = await createHarness();
    await twice.desk.close();
    await twice.cleanup();
  });

  it("stops listening", async () => {
    const stopping = await createHarness();
    const { url } = stopping.desk;
    await stopping.cleanup();
    await expect(fetch(`${url}/api/health`)).rejects.toThrow();
  });

  it("ignores a throwing event listener", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.subscribe(() => {
      throw new Error("bad listener");
    });
    bus.subscribe((event) => seen.push(event.type));
    expect(() => bus.emit({ type: "log", issue: 1, message: "x" })).not.toThrow();
    expect(seen).toEqual(["log"]);
  });

  it("unsubscribes a listener", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    const off = bus.subscribe((event) => seen.push(event.type));
    off();
    bus.emit({ type: "log", issue: 1, message: "x" });
    expect(seen).toEqual([]);
  });
});

describe("log buffer", () => {
  const clock = { now: () => new Date("2026-03-01T10:00:00.000Z") };

  it("skips state events and numbers entries across issues", () => {
    const buffer = createLogBuffer(clock);
    expect(buffer.append({ type: "state", issue: 1, state: makeState(1) })).toBeNull();
    const first = buffer.append({ type: "log", issue: 1, message: "a" });
    const second = buffer.append({ type: "log", issue: 2, message: "b" });
    expect([first?.seq, second?.seq]).toEqual([1, 2]);
    expect(buffer.read(1, 0).entries).toHaveLength(1);
    expect(buffer.read(3, 0)).toEqual({ entries: [], last: 0 });
  });

  it("redacts secrets in text", () => {
    const buffer = createLogBuffer(clock);
    const entry = buffer.append({
      type: "agent",
      issue: 1,
      role: "builder",
      event: {
        type: "tool_call",
        id: "x",
        tool: "Bash",
        command: "curl -H 'Authorization: Bearer sk-abcdefghijklmnop' https://x",
        paths: []
      }
    });
    expect(entry?.text).not.toContain("sk-abcdefghijklmnop");
  });
});
