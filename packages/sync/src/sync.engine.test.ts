import {
  createSQLiteCorePersistenceAdapter,
  type PersistedCollectionPersistence,
  type SQLiteDriver
} from "@tanstack/db-sqlite-persistence-core";
import type {
  LeaderElection,
  OnlineDetector,
  StorageAdapter
} from "@tanstack/offline-transactions";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
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
import { SyncAuthError, SyncNetworkError, SyncRequestError } from "./sync.util";

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
    // False: no response, as the app's transport reports a failed fetch.
    online: true,
    // True: the server answers every request with an error.
    failing: false,
    // True: the server answers pushes with an error and pulls as usual.
    pushFailing: false,
    signedIn: true,
    reject: new Set<string>(),
    // Each pull with a cursor answers resetRequired while this is set.
    reset: false,
    refuseRequest: false,
    // Rows of each list a first pull, or one older page, returns; null returns every row.
    window: null as number | null
  };
  const stamp = "2026-10-31T00:00:00.000Z";

  function guard() {
    if (!state.online) throw new SyncNetworkError("Failed to fetch");
    if (state.failing) throw new Error("server error");
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
    if ("noteUpdate" in mutation) {
      const { id, title, body } = mutation.noteUpdate;
      const note = notes.get(id);
      if (!note) return { status: "REJECTED", code: "NOT_FOUND" };
      notes.set(id, {
        ...note,
        ...(title === undefined ? {} : { title }),
        ...(body === undefined ? {} : { body })
      });
      versions.set(`NOTE:${id}`, ++version);
      return applied;
    }
    return applied;
  }

  /** Each list's rows newest first from `offset`, `state.window` of them, and where the rest continue. */
  function listPage(offset: number) {
    const size = state.window ?? Number.POSITIVE_INFINITY;
    const newest = <TRow>(rows: Map<string, TRow>) => [...rows.values()].reverse();
    const slice = <TRow>(rows: TRow[]) => rows.slice(offset, offset + size);
    const olderOf = (list: string, rows: unknown[]) =>
      rows.length > offset + size ? [{ list, after: `${list}:${String(offset + size)}` }] : [];
    return {
      todos: slice(newest(todos)),
      notes: slice(newest(notes)),
      older: [...olderOf("todos", [...todos.values()]), ...olderOf("notes", [...notes.values()])]
    };
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
          resetRequired: true,
          older: []
        };
      }
      if (cursor === null && state.window !== null) {
        return {
          ...listPage(0),
          deleted: [],
          cursor: String(version),
          hasMore: false,
          resetRequired: false
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
        resetRequired: false,
        older: []
      };
      return page;
    },
    async pullOlder(after) {
      guard();
      const [list, offset] = after.split(":");
      const page = listPage(Number(offset));
      return {
        todos: list === "todos" ? page.todos : [],
        notes: list === "notes" ? page.notes : [],
        deleted: [],
        cursor: null,
        hasMore: false,
        resetRequired: false,
        older: page.older.filter((entry) => entry.list === list)
      };
    },
    async push(idempotencyKey, mutations) {
      guard();
      if (state.pushFailing) throw new Error("push unavailable");
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

/**
 * Device storage over Node's built-in SQLite, standing in for the browser's
 * OPFS database. Like the browser's worker, it runs one operation at a time.
 * `idle` waits until no storage call is in flight, as a page that closes
 * after its writes have finished.
 */
function deviceStorage(): {
  persistence: PersistedCollectionPersistence;
  idle: () => Promise<void>;
} {
  const db = new DatabaseSync(":memory:");
  // SAFETY: the persistence adapter binds only SQLite values: text, numbers, null, and bytes.
  const bind = (params: ReadonlyArray<unknown> = []) => params as SQLInputValue[];

  function connection(depth: number): SQLiteDriver {
    const direct: SQLiteDriver = {
      exec: async (sql) => {
        db.exec(sql);
      },
      // SAFETY: each caller names the row shape its own SELECT returns.
      query: async <T>(sql: string, params?: ReadonlyArray<unknown>) =>
        db.prepare(sql).all(...bind(params)) as T[],
      run: async (sql, params) => {
        db.prepare(sql).run(...bind(params));
      },
      async transaction(fn) {
        const savepoint = `sp${String(depth)}`;
        db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
        try {
          const result = await fn(connection(depth + 1));
          db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
          return result;
        } catch (error) {
          db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
          throw error;
        }
      }
    };
    return direct;
  }

  // Top-level calls queue; a transaction's own calls run inside it.
  const inner = connection(0);
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }
  const driver: SQLiteDriver = {
    exec: (sql) => serial(() => inner.exec(sql)),
    query: <T>(sql: string, params?: ReadonlyArray<unknown>) =>
      serial(() => inner.query<T>(sql, params)),
    run: (sql, params) => serial(() => inner.run(sql, params)),
    transaction: (fn) => serial(() => inner.transaction(fn))
  };
  async function idle() {
    let last: Promise<unknown>;
    do {
      last = queue;
      await last;
      await new Promise((resolve) => setTimeout(resolve, 0));
    } while (last !== queue);
  }
  return { persistence: { adapter: createSQLiteCorePersistenceAdapter({ driver }) }, idle };
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
  onRejected?: (r: SyncRejection) => void,
  persistence?: PersistedCollectionPersistence
) {
  const online = controlledOnline();
  const engine = createSyncEngine({
    transport: server.transport,
    storage: memoryStorage(),
    onlineDetector: online,
    leaderElection: alwaysLeader,
    ...(onRejected ? { onRejected } : {}),
    ...(persistence ? { persistence } : {})
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
    expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] });
  });

  it("skips a deletion of an entity it does not sync, even one with a Todo's id", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Kept", description: null, noteId: null } });
    // A newer server syncs an entity this client predates.
    const pull = server.transport.pull;
    server.transport.pull = async (cursor) => {
      const page = await pull(cursor);
      return { ...page, deleted: [...page.deleted, { entity: "INVOICE", id: "t1" }] };
    };
    const { engine } = start(server);

    await engine.ready;
    await engine.pull();

    expect(titles(engine)).toEqual(["Kept"]);
    expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] });
  });

  it("shows a local create at once and keeps the server's row after the push", async () => {
    const server = createFakeServer();
    const { engine } = start(server);
    await engine.ready;

    const id = await engine.createTodo({ title: "Local", description: "Draft" });

    expect(engine.todos.get(id)).toMatchObject({ title: "Local", description: "Draft" });
    await vi.waitFor(() => expect(server.todos.has(id)).toBe(true));
    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] })
    );
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
    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "offline", pending: 2, older: [] })
    );
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
    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] })
    );
  });

  it("keeps a change once its call resolves, even if the page closes while a push runs", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Draft", description: null, noteId: null } });
    // Outbox storage as a page sees it: writes take a moment, and none land after the page closes.
    const store = memoryStorage();
    let closed = false;
    const storage: StorageAdapter = {
      ...store,
      set: async (key, value) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (!closed) await store.set(key, value);
      }
    };
    const pushOnce = server.transport.push;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.transport.push = async (key, mutations) => {
      await held;
      return pushOnce(key, mutations);
    };
    const open = () =>
      createSyncEngine({
        transport: server.transport,
        storage,
        onlineDetector: controlledOnline(),
        leaderElection: alwaysLeader
      });
    const first = open();
    engines.push(first);
    await first.ready;

    await first.updateTodo("t1", { title: "Edited" });
    await first.updateTodo("t1", { completed: true });
    closed = true;
    first.dispose();
    closed = false;
    server.transport.push = pushOnce;
    release();
    engines.push(open());

    await vi.waitFor(
      () => expect(server.todos.get("t1")).toMatchObject({ title: "Edited", completed: true }),
      { timeout: 5_000 }
    );
  });

  it("sends the body each Note body edit started from, and no base with a title edit", async () => {
    const server = createFakeServer();
    server.apply({ noteCreate: { id: "n1", title: "Plan", body: "one" } });
    const { engine } = start(server);
    await engine.ready;
    const settled = () => vi.waitFor(() => expect(engine.getStatus().pending).toBe(0));

    await engine.updateNote("n1", { body: "one\ntwo" });
    await settled();
    await engine.updateNote("n1", { body: null });
    await settled();
    await engine.updateNote("n1", { title: "Renamed" });
    await settled();

    expect(server.pushes.flatMap((push) => push.mutations)).toEqual([
      { noteUpdate: { id: "n1", body: "one\ntwo", baseBody: "one" } },
      { noteUpdate: { id: "n1", body: null, baseBody: "one\ntwo" } },
      { noteUpdate: { id: "n1", title: "Renamed" } }
    ]);
  });

  it("rolls back a change the server refuses and reports it", async () => {
    const server = createFakeServer();
    server.state.reject.add("Refused");
    const rejections: SyncRejection[] = [];
    const { engine } = start(server, (rejection) => rejections.push(rejection));
    await engine.ready;

    const id = await engine.createTodo({ title: "Refused" });

    await vi.waitFor(() =>
      expect(rejections).toEqual([
        {
          entity: "TODO",
          id,
          code: "INVALID",
          change: { todoCreate: { id, title: "Refused", description: null, noteId: null } }
        }
      ])
    );
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

    await vi.waitFor(() =>
      expect(rejections).toEqual([
        {
          entity: "TODO",
          id,
          code: "INVALID",
          change: { todoCreate: { id, title: "Refused", description: null, noteId: null } }
        }
      ])
    );
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
    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] })
    );
  });
});

describe("createSyncEngine status", () => {
  it.each([
    { device: false, server: { online: false, failing: false }, state: "offline" },
    { device: true, server: { online: false, failing: false }, state: "unreachable" },
    { device: true, server: { online: true, failing: true }, state: "error" }
  ])(
    "shows $state when the device online is $device and the server is $server",
    async ({ device, server: serverState, state }) => {
      const server = createFakeServer();
      const { engine, online } = start(server);
      await engine.ready;
      Object.assign(server.state, serverState);
      online.set(device);

      await engine.pull().catch(() => undefined);

      expect(engine.getStatus()).toEqual({ state, pending: 0, older: [] });
    }
  );

  it("shows a failing push instead of Syncing while its change waits", async () => {
    const server = createFakeServer();
    const { engine } = start(server);
    await engine.ready;
    server.state.online = false;

    await engine.createTodo({ title: "Waiting" });

    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "unreachable", pending: 1, older: [] })
    );
  });

  it("keeps showing a failing push after a pull succeeds", async () => {
    const server = createFakeServer();
    const { engine } = start(server);
    await engine.ready;
    server.state.pushFailing = true;
    await engine.createTodo({ title: "Waiting" });
    await vi.waitFor(() => expect(engine.getStatus().state).toBe("error"));

    await engine.pull();

    expect(engine.getStatus()).toEqual({ state: "error", pending: 1, older: [] });
  });

  it("retries at once on request, before the Outbox's backoff, and shows the failure again if it fails", async () => {
    const server = createFakeServer();
    const { engine } = start(server);
    await engine.ready;
    server.state.online = false;
    const id = await engine.createTodo({ title: "Waiting" });
    await vi.waitFor(() => expect(engine.getStatus().state).toBe("unreachable"));

    engine.retry();
    expect(engine.getStatus().state).toBe("syncing");
    await vi.waitFor(() => expect(engine.getStatus().state).toBe("unreachable"));

    server.state.online = true;
    engine.retry();

    // The first automatic retry waits at least 1 s.
    await vi.waitFor(() => expect(server.todos.has(id)).toBe(true), { timeout: 500 });
    await vi.waitFor(() =>
      expect(engine.getStatus()).toEqual({ state: "online", pending: 0, older: [] })
    );
  });
});

describe("createSyncEngine with device storage", () => {
  it("shows stored rows before any pull, then pulls only the changes after the stored cursor", async () => {
    const { persistence, idle } = deviceStorage();
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "First", description: null, noteId: null } });
    const first = start(server, undefined, persistence).engine;
    await first.ready;
    await idle();
    first.dispose();

    server.apply({ todoCreate: { id: "t2", title: "Second", description: null, noteId: null } });
    const cursors: Array<string | null> = [];
    const pullOnce = server.transport.pull;
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.transport.pull = async (cursor) => {
      cursors.push(cursor);
      await released;
      return pullOnce(cursor);
    };
    const second = start(server, undefined, persistence).engine;

    await vi.waitFor(() => expect(second.todos.isReady()).toBe(true));
    expect(titles(second)).toEqual(["First"]);
    release();
    await second.ready;

    expect(titles(second)).toEqual(["First", "Second"]);
    expect(cursors).toHaveLength(1);
    expect(cursors).not.toContain(null);
  });

  it("loads the newest rows first, then older rows on demand, and remembers the rest after a restart", async () => {
    const { persistence, idle } = deviceStorage();
    const server = createFakeServer();
    server.state.window = 2;
    for (const title of ["T1", "T2", "T3", "T4", "T5"]) {
      server.apply({ todoCreate: { id: title, title, description: null, noteId: null } });
    }
    const first = start(server, undefined, persistence).engine;
    await first.ready;

    expect(titles(first)).toEqual(["T4", "T5"]);
    expect(first.getStatus().older).toEqual(["todos"]);
    await first.loadOlder("todos");
    expect(titles(first)).toEqual(["T2", "T3", "T4", "T5"]);
    await idle();
    first.dispose();

    const second = start(server, undefined, persistence).engine;
    await second.ready;
    expect(second.getStatus().older).toEqual(["todos"]);
    await second.loadOlder("todos");

    expect(titles(second)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(second.getStatus().older).toEqual([]);
  });

  it("applies a resumed pull's update and deletion to rows loaded from the device", async () => {
    const { persistence, idle } = deviceStorage();
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Draft", description: null, noteId: null } });
    server.apply({ todoCreate: { id: "t2", title: "Gone", description: null, noteId: null } });
    const first = start(server, undefined, persistence).engine;
    await first.ready;
    await idle();
    first.dispose();

    server.apply({ todoUpdate: { id: "t1", title: "Final" } });
    server.apply({ todoDelete: { id: "t2" } });
    const second = start(server, undefined, persistence).engine;
    await second.ready;

    expect(titles(second)).toEqual(["Final"]);
  });

  it("rebuilds the stored rows in full when the server asks for a reset", async () => {
    const { persistence, idle } = deviceStorage();
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Kept", description: null, noteId: null } });
    server.apply({ todoCreate: { id: "t2", title: "Gone", description: null, noteId: null } });
    const first = start(server, undefined, persistence).engine;
    await first.ready;
    await idle();
    first.dispose();
    // The server lost t2 without a Tombstone the client can still read.
    server.todos.delete("t2");
    server.state.reset = true;

    const second = start(server, undefined, persistence).engine;
    await second.ready;
    server.state.reset = false;
    expect(titles(second)).toEqual(["Kept"]);
    await idle();
    second.dispose();

    server.state.online = false;
    const third = start(server, undefined, persistence).engine;
    await third.ready;
    expect(titles(third)).toEqual(["Kept"]);
  });

  it("keeps the server's rows when a restart sends a change the page left in the Outbox", async () => {
    const server = createFakeServer();
    server.apply({ todoCreate: { id: "t1", title: "Draft", description: null, noteId: null } });
    server.apply({ todoCreate: { id: "t2", title: "Other", description: null, noteId: null } });
    const outbox = memoryStorage();
    const open = (persistence?: PersistedCollectionPersistence) => {
      const engine = createSyncEngine({
        transport: server.transport,
        storage: outbox,
        onlineDetector: controlledOnline(),
        leaderElection: alwaysLeader,
        ...(persistence ? { persistence } : {})
      });
      engines.push(engine);
      return engine;
    };
    const first = open();
    await first.ready;
    // The page closes after the push lands and before the pull after it answers.
    const pullOnce = server.transport.pull;
    server.transport.pull = () => new Promise<SyncPullPage>(() => undefined);
    await first.updateTodo("t1", { completed: true });
    await vi.waitFor(() => expect(server.todos.get("t1")?.completed).toBe(true));
    first.dispose();
    server.transport.pull = pullOnce;

    const second = open(deviceStorage().persistence);
    await second.ready;
    await vi.waitFor(() => expect(second.getStatus().pending).toBe(0));
    await second.pull();

    expect(titles(second)).toEqual(["Draft", "Other"]);
    expect(second.todos.get("t1")?.completed).toBe(true);
  });
});
