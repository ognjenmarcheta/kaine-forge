import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backoffDelay, connectEventStream, type EventSourceLike } from "./api.stream";

class FakeSource implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: string): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data }));
  }
}

const summary = {
  readable: true,
  issueNumber: 7,
  title: null,
  url: null,
  labels: [],
  stage: "plan-gate",
  status: "waiting",
  branch: null,
  loops: { check: 0, review: 0 },
  needsYouReason: null,
  resumeStage: null,
  prUrl: null,
  contract: null,
  stageEnteredAt: null,
  progress: ["passed", "passed", "waiting", "idle", "idle", "idle", "idle", "idle"],
  currentNode: "plan-gate",
  busy: false,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z"
};

const setup = (sync: () => Promise<boolean> = () => Promise.resolve(true)) => {
  const sources: FakeSource[] = [];
  const events: unknown[] = [];
  const statuses: string[] = [];
  const onSync = vi.fn(sync);
  const stream = connectEventStream({
    createSource: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
    onSync
  });
  return { sources, events, statuses, onSync, stream };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("backoffDelay", () => {
  it("doubles and stops at the cap", () => {
    expect([0, 1, 2, 3, 10].map((attempt) => backoffDelay(attempt, 1000, 30_000))).toEqual([
      1000, 2000, 4000, 8000, 30_000
    ]);
  });
});

describe("connectEventStream", () => {
  it("goes live on open, syncs, and parses each event with its contract", () => {
    const { sources, events, statuses, onSync } = setup();
    sources[0]?.onopen?.(new Event("open"));
    expect(statuses).toEqual(["connecting", "live"]);
    expect(onSync).toHaveBeenCalledTimes(1);
    sources[0]?.emit("issue-updated", JSON.stringify({ type: "issue-updated", summary }));
    sources[0]?.emit("issue-updated", "not json");
    sources[0]?.emit("issue-removed", JSON.stringify({ type: "issue-removed", issueNumber: "x" }));
    expect(events).toEqual([{ type: "issue-updated", summary }]);
  });

  it("syncs, then reconnects with growing delays after an error", async () => {
    const { sources, statuses, onSync } = setup();
    sources[0]?.onerror?.(new Event("error"));
    expect(sources[0]?.closed).toBe(true);
    expect(statuses.at(-1)).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(999);
    expect(sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);

    sources[1]?.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(3);
  });

  it("resets the delay after a successful open", async () => {
    const { sources } = setup();
    sources[0]?.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(1000);
    sources[1]?.onopen?.(new Event("open"));
    sources[1]?.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sources).toHaveLength(3);
  });

  it("stops reconnecting when the sync says the session is gone", async () => {
    const { sources } = setup(() => Promise.resolve(false));
    sources[0]?.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sources).toHaveLength(1);
  });

  it("ignores everything after close and clears the pending retry", async () => {
    const { sources, events, stream } = setup();
    sources[0]?.onerror?.(new Event("error"));
    stream.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sources).toHaveLength(1);
    sources[0]?.emit("issue-removed", JSON.stringify({ type: "issue-removed", issueNumber: 7 }));
    expect(events).toEqual([]);
  });
});
