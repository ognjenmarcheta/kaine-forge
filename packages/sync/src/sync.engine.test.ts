import type {
  LeaderElection,
  OnlineDetector,
  StorageAdapter
} from "@tanstack/offline-transactions";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSyncEngine, type SyncEngine } from "./sync.engine";
import type {
  SyncMutation,
  SyncMutationOutcome,
  SyncNote,
  SyncPullPage,
  SyncRejection,
  SyncTodo,
  SyncTransport
} from "./sync.type";
import { SyncAuthError, SyncRequestError } from "./sync.util";

/** A server with the protocol's rules: one version per change, Tombstones, replayed keys. */
function createFakeServer() {
  let version = 0;
  const todos = new Map<string, SyncTodo>();
  const notes = new Map<string, SyncNote>();
  // The Sync Version of each row, by `TODO:id` or `NOTE:id`.
  const versions = new Map<string, number>();
  const tombstones: Array<{ entity: "TODO" | "NOTE"; id: string; version: number }> = [];
  const receipts = new Map<string, SyncMutationOutcome[]>();
  const pushes: Array<{ idempotencyKey: string; mutations: SyncMutation[] }> = [];
  const state = {
    online: true,
    signedIn: true,
    reject: new Set<string>(),
    // Each pull with a cursor answers resetRequired while this is set.
    reset: false,
    refuseRequest: false
  };
  const stamp = "2026-10-31T00:00:00.000Z";

  function guard() {
    if (!state.online) throw new TypeError("Failed to fetch");
    if (!state.signedIn) throw new SyncAuthError("authentication required");
  }

  function apply(mutation: SyncMutation): SyncMutationOutcome {
    const applied: SyncMutationOutcome = { status: "APPLIED", code: null };
    if ("todoCreate" in mutation) {
      const { id, title, description, noteId } = mutation.todoCreate;
      if (state.reject.has(title)) return { status: "REJECTED", code: "INVALID" };
      if (noteId && !notes.has(noteId)) return { status: "REJECTED", code: "NOT_FOUND" };
      todos.set(id, {
        id,
        title,
        description,
        noteId,
        completed: false,
        attachments: [],
        createdAt: stamp,
        updatedAt: stamp
      });
      versions.set(`TODO:${id}`, ++version);
      return applied;
    }
    if ("todoUpdate" in mutation) {
      const { id, ...patch } = mutation.todoUpdate;
      const todo = todos.get(id);
      if (!todo) return { status: "REJECTED", code: "NOT_FOUND" };
      todos.set(id, { ...todo, ...patch });
      versions.set(`TODO:${id}`, ++version);
      return applied;
    }
    if ("todoDelete" in mutation) {
      if (todos.delete(mutation.todoDelete.id)) {
        tombstones.push({ entity: "TODO", id: mutation.todoDelete.id, version: ++version });
      }
      return applied;
    }
    if ("noteCreate" in mutation) {
      const { id, title, body } = mutation.noteCreate;
      notes.set(id, { id, title, body, createdAt: stamp, updatedAt: stamp });
      versions.set(`NOTE:${id}`, ++version);
      return applied;
    }
    return applied;
  }

  const transport: SyncTransport = {
    async pull(cursor) {
      guard();
      if (state.reset && cursor !== null) {
        return {
          todos: [],
          notes: [],
          deleted: [],
          cursor: null,
          hasMore: false,
          resetRequired: true
        };
      }
      const after = cursor === null ? 0 : Number(cursor);
      const changed = (entity: string) => (row: { id: string }) =>
        (versions.get(`${entity}:${row.id}`) ?? 0) > after;
      const page: SyncPullPage = {
        todos: [...todos.values()].filter(changed("TODO")),
        notes: [...notes.values()].filter(changed("NOTE")),
        deleted: tombstones
          .filter((tombstone) => cursor !== null && tombstone.version > after)
          .map(({ entity, id }) => ({ entity, id })),
        cursor: String(version),
        hasMore: false,
        resetRequired: false
      };
      return page;
    },
    async push(idempotencyKey, mutations) {
      guard();
      if (state.refuseRequest) throw new SyncRequestError("invalid idempotency key");
      pushes.push({ idempotencyKey, mutations });
      const stored = receipts.get(idempotencyKey);
      if (stored) return stored;
      const outcomes = mutations.map(apply);
      receipts.set(idempotencyKey, outcomes);
      return outcomes;
    }
  };

  return { transport, todos, notes, pushes, state, apply };
}

function memoryStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
    keys: async () => [...store.keys()],
    clear: async () => {
      store.clear();
    }
  };
}

function controlledOnline(): OnlineDetector & { set: (online: boolean) => void } {
  let online = true;
  const listeners = new Set<() => void>();
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notifyOnline() {
      for (const listener of listeners) listener();
    },
    dispose() {
      listeners.clear();
    },
    set(next) {
      online = next;
      for (const listener of listeners) listener();
    }
  };
}

const alwaysLeader: LeaderElection = {
  requestLeadership: async () => true,
  releaseLeadership: () => undefined,
  isLeader: () => true,
  onLeadershipChange: () => () => undefined
};

const engines: SyncEngine[] = [];

function start(
  server: ReturnType<typeof createFakeServer>,
  onRejected?: (r: SyncRejection) => void
) {
  const online = controlledOnline();
  const engine = createSyncEngine({
    transport: server.transport,
    storage: memoryStorage(),
    onlineDetector: online,
    leaderElection: alwaysLeader,
    ...(onRejected ? { onRejected } : {})
  });
  engines.push(engine);
  return { engine, online };
}

const titles = (engine: SyncEngine) => engine.todos.toArray.map((todo) => todo.title).sort();

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

describe("createSyncEngine", () => {
  it("loads the server's rows, then applies later changes and deletions", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "First", description: null, noteId: null } });
    server.apply({ todoCreate: { id: "t2", title: "Second", description: null, noteId: null } });
    const { engine } = start(server);

    await engine.ready;
    expect(titles(engine)).toEqual(["First", "Second"]);

    server.apply({ todoUpdate: { id: "t1", title: "Renamed" } });
    server.apply({ todoDelete: { id: "t2" } });
    await engine.pull();

    expect(titles(engine)).toEqual(["Renamed"]);
    expect(engine.getStatus()).toEqual({ state: "online", pending: 0 });
  });

  it("shows a local create at once and keeps the server's row after the push", async () => {
    const server = createFakeServer();
    const { engine } = start(server);
    await engine.ready;

    const id = await engine.createTodo({ title: "Local", description: "Draft" });

    expect(engine.todos.get(id)).toMatchObject({ title: "Local", description: "Draft" });
    await vi.waitFor(() => expect(server.todos.has(id)).toBe(true));
    await vi.waitFor(() => expect(engine.getStatus()).toEqual({ state: "online", pending: 0 }));
    expect(engine.todos.get(id)).toMatchObject({
      title: "Local",
      createdAt: "2026-10-31T00:00:00.000Z"
    });
    expect(server.pushes).toEqual([
      {
        idempotencyKey: expect.any(String),
        mutations: [{ todoCreate: { id, title: "Local", description: "Draft", noteId: null } }]
      }
    ]);
  });

  it("sends only the fields an update changed", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Task", description: "Keep", noteId: null } });
    const { engine } = start(server);
    await engine.ready;

    await engine.updateTodo("t1", { completed: true });

    await vi.waitFor(() => expect(server.todos.get("t1")?.completed).toBe(true));
    expect(server.pushes.at(-1)?.mutations).toEqual([
      { todoUpdate: { id: "t1", completed: true } }
    ]);
    expect(server.todos.get("t1")?.description).toBe("Keep");
  });

  it("keeps changes made offline and sends them in order once online", async () => {
    const server = createFakeServer();
    const { engine, online } = start(server);
    await engine.ready;
    server.state.online = false;
    online.set(false);

    const noteId = await engine.createNote({ title: "Trip" });
    await engine.createTodo({ title: "Tickets", noteId });

    expect(titles(engine)).toEqual(["Tickets"]);
    await vi.waitFor(() => expect(engine.getStatus()).toEqual({ state: "offline", pending: 2 }));
    expect(server.pushes).toEqual([]);

    server.state.online = true;
    online.set(true);

    // The Todo's Note exists on the server first, so neither is rejected.
    await vi.waitFor(() => expect(server.todos.size).toBe(1), { timeout: 5_000 });
    expect(server.notes.has(noteId)).toBe(true);
    expect(server.pushes.map((push) => Object.keys(push.mutations[0] ?? {})[0])).toEqual([
      "noteCreate",
      "todoCreate"
    ]);
    await vi.waitFor(() => expect(engine.getStatus()).toEqual({ state: "online", pending: 0 }));
  });

  it("rolls back a change the server refuses and reports it", async () => {
    const server = createFakeServer();
    server.state.reject.add("Refused");
    const rejections: SyncRejection[] = [];
    const { engine } = start(server, (rejection) => rejections.push(rejection));
    await engine.ready;

    const id = await engine.createTodo({ title: "Refused" });

    await vi.waitFor(() => expect(rejections).toEqual([{ entity: "TODO", id, code: "INVALID" }]));
    await vi.waitFor(() => expect(engine.todos.get(id)).toBeUndefined());
    expect(engine.getStatus().pending).toBe(0);
  });

  it("keeps a reset the server asked for when the full pull after it fails", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Kept", description: null, noteId: null } });
    server.apply({ todoCreate: { id: "t2", title: "Gone", description: null, noteId: null } });
    const { engine } = start(server);
    await engine.ready;
    // The server lost t2 without a Tombstone the client can still read.
    server.todos.delete("t2");
    server.state.reset = true;
    const pullOnce = server.transport.pull;
    let failNext = false;
    server.transport.pull = async (cursor) => {
      const page = await pullOnce(cursor);
      if (page.resetRequired) failNext = true;
      else if (failNext) {
        failNext = false;
        throw new TypeError("Failed to fetch");
      }
      return page;
    };

    await expect(engine.pull()).rejects.toThrow("Failed to fetch");
    server.state.reset = false;
    await engine.pull();

    expect(titles(engine)).toEqual(["Kept"]);
  });

  it("reports and rolls back changes in a request the server refuses as a whole", async () => {
    const server = createFakeServer();
    server.state.refuseRequest = true;
    const rejections: SyncRejection[] = [];
    const { engine } = start(server, (rejection) => rejections.push(rejection));
    await engine.ready;

    const id = await engine.createTodo({ title: "Refused" });

    await vi.waitFor(() => expect(rejections).toEqual([{ entity: "TODO", id, code: "INVALID" }]));
    await vi.waitFor(() => expect(engine.todos.get(id)).toBeUndefined());
  });

  it("keeps Pending Changes while signed out and sends them after sign-in", async () => {
    const server = createFakeServer();
    const { engine, online } = start(server);
    await engine.ready;
    server.state.signedIn = false;

    const id = await engine.createTodo({ title: "Kept" });

    await vi.waitFor(() => expect(engine.getStatus().state).toBe("signedOut"));
    expect(engine.todos.get(id)?.title).toBe("Kept");

    server.state.signedIn = true;
    online.notifyOnline();

    await vi.waitFor(() => expect(server.todos.has(id)).toBe(true), { timeout: 5_000 });
    await vi.waitFor(() => expect(engine.getStatus()).toEqual({ state: "online", pending: 0 }));
  });
});
