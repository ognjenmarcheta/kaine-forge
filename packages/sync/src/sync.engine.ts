import {
  createCollection,
  type Collection,
  type PendingMutation,
  type SyncAppliedReceipt,
  type Transaction
} from "@tanstack/db";
import {
  BroadcastChannelLeader,
  IndexedDBAdapter,
  NonRetriableError,
  startOfflineExecutor,
  WebLocksLeader,
  type LeaderElection,
  type OfflineConfig,
  type OnlineDetector,
  type StorageAdapter
} from "@tanstack/offline-transactions";

import type {
  SyncNote,
  SyncNotePatch,
  SyncPullPage,
  SyncRejection,
  SyncStatus,
  SyncTodo,
  SyncTodoPatch,
  SyncTransport
} from "./sync.type";
import { SyncAuthError, SyncRequestError, toSyncMutation, type SyncEntity } from "./sync.util";

/** How often a client pulls without a poke: realtime events reach one API process only. */
const PULL_INTERVAL_MS = 60_000;

export interface SyncEngineOptions {
  transport: SyncTransport;
  /**
   * The Outbox store, named after the User and Organization: one device keeps
   * one Outbox per pair, so no store is ever shared.
   */
  storage: StorageAdapter;
  onlineDetector?: OnlineDetector;
  leaderElection?: LeaderElection;
  pullIntervalMs?: number;
  /** A Pending Change the server refused; it was already rolled back. */
  onRejected?: (rejection: SyncRejection) => void;
}

export interface SyncEngine {
  todos: Collection<SyncTodo, string>;
  notes: Collection<SyncNote, string>;
  /** Resolves once the Outbox is loaded and the first pull settled, whether or not it succeeded. */
  ready: Promise<void>;
  /** Creates a Todo with a client id and returns the id at once. */
  createTodo: (input: {
    title: string;
    description?: string | null;
    noteId?: string | null;
  }) => Promise<string>;
  updateTodo: (id: string, patch: SyncTodoPatch) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  createNote: (input: { title: string; body?: string | null }) => Promise<string>;
  updateNote: (id: string, patch: SyncNotePatch) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  /** Pulls the changes after the cursor; a call during a pull runs one more after it. */
  pull: () => Promise<void>;
  getStatus: () => SyncStatus;
  subscribeStatus: (listener: (status: SyncStatus) => void) => () => void;
  dispose: () => void;
}

type PushParams = Parameters<OfflineConfig["mutationFns"][string]>[0];

/** What a collection's sync run hands the engine. */
interface SyncHandle<TRow extends { id: string }> {
  begin: () => void;
  write: (
    message: { type: "insert" | "update"; value: TRow } | { type: "delete"; key: string }
  ) => void;
  commit: () => SyncAppliedReceipt;
  truncate: () => void;
  markReady: () => void;
}

/** One synced collection: its sync run's handle, and the keys in its synced state. */
interface SyncTarget<TRow extends { id: string }> {
  handle: SyncHandle<TRow> | null;
  keys: Set<string>;
}

/**
 * Writes one page's rows and deletions into a collection's synced state. It
 * never awaits the commit: during a push, sync commits wait for the push.
 */
function applyRows<TRow extends { id: string }>(
  target: SyncTarget<TRow>,
  values: TRow[],
  deletedIds: string[],
  reset: boolean
): void {
  const { handle, keys } = target;
  if (!handle || (!reset && values.length === 0 && deletedIds.length === 0)) return;

  handle.begin();
  if (reset) {
    handle.truncate();
    keys.clear();
  }
  for (const value of values) {
    handle.write({ type: keys.has(value.id) ? "update" : "insert", value });
    keys.add(value.id);
  }
  for (const id of deletedIds) {
    if (keys.delete(id)) handle.write({ type: "delete", key: id });
  }
  void handle.commit();
}

function entityOf(collectionId: string): SyncEntity {
  if (collectionId === "todos") return "TODO";
  if (collectionId === "notes") return "NOTE";
  throw new Error(`no synced entity for collection ${collectionId}`);
}

/**
 * Offline sync for one User in one Organization: Todo and Note collections
 * fed by `syncPull`, and an Outbox that replays local changes through
 * `syncPush` in order. Create one per (User, Organization) and dispose it on
 * a switch; the server scopes every request from the session regardless.
 */
export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { transport } = options;
  // The synced keys tell an insert from an update.
  const todoTarget: SyncTarget<SyncTodo> = { handle: null, keys: new Set() };
  const noteTarget: SyncTarget<SyncNote> = { handle: null, keys: new Set() };
  let cursor: string | null = null;
  let pulling = false;
  let pullFailed = false;
  let signedOut = false;
  let disposed = false;
  let status: SyncStatus = { state: "syncing", pending: 0 };
  const listeners = new Set<(status: SyncStatus) => void>();

  function register<TRow extends { id: string }>(
    target: SyncTarget<TRow>,
    handle: SyncHandle<TRow>
  ): () => void {
    target.handle = handle;
    return () => {
      target.handle = null;
    };
  }

  const todos = createCollection<SyncTodo, string>({
    id: "todos",
    getKey: (todo) => todo.id,
    startSync: true,
    gcTime: 0,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, truncate, markReady }) =>
        register(todoTarget, { begin, write, commit, truncate, markReady })
    }
  });
  const notes = createCollection<SyncNote, string>({
    id: "notes",
    getKey: (note) => note.id,
    startSync: true,
    gcTime: 0,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, truncate, markReady }) =>
        register(noteTarget, { begin, write, commit, truncate, markReady })
    }
  });
  // A collection pauses its sync without subscribers; the engine stays its subscriber.
  const keepAlive = [
    todos.subscribeChanges(() => undefined),
    notes.subscribeChanges(() => undefined)
  ];

  function apply(page: SyncPullPage, reset: boolean): void {
    const deletedIds = (entity: SyncEntity) =>
      page.deleted.filter((deletion) => deletion.entity === entity).map(({ id }) => id);
    applyRows(todoTarget, page.todos, deletedIds("TODO"), reset);
    applyRows(noteTarget, page.notes, deletedIds("NOTE"), reset);
  }

  async function drain(): Promise<void> {
    pulling = true;
    publish();
    let reset = false;
    try {
      for (;;) {
        const page = await transport.pull(cursor);
        if (disposed) return;
        if (page.resetRequired) {
          // The server cannot replay from here: rebuild from a full pull.
          cursor = null;
          reset = true;
          continue;
        }
        apply(page, reset);
        reset = false;
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
      pullFailed = false;
      signedOut = false;
    } catch (error) {
      pullFailed = true;
      if (error instanceof SyncAuthError) signedOut = true;
      throw error;
    } finally {
      pulling = false;
      publish();
    }
  }

  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  function pull(): Promise<void> {
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
      return running;
    }
    // A pull already running may have read before this call's cause.
    queued ??= running
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return pull();
      });
    return queued;
  }

  async function push({ transaction, idempotencyKey }: PushParams): Promise<void> {
    const changes = transaction.mutations.map((mutation: PendingMutation) => ({
      entity: entityOf(mutation.collection.id),
      type: mutation.type,
      key: String(mutation.key),
      modified: mutation.modified,
      changes: mutation.changes
    }));
    let outcomes;
    try {
      outcomes = await transport.push(idempotencyKey, changes.map(toSyncMutation));
    } catch (error) {
      if (error instanceof SyncAuthError) {
        signedOut = true;
        publish();
      }
      // Resending a refused request cannot succeed; anything else retries.
      if (error instanceof SyncRequestError) throw new NonRetriableError(error.message);
      throw error;
    } finally {
      queueMicrotask(publish);
    }
    signedOut = false;
    // Hold the optimistic rows until the server's rows are in the collection,
    // so nothing flickers. A failed pull retries the push: its key replays it.
    await pull();

    const rejections = outcomes.flatMap((outcome, index) => {
      const change = changes[index];
      return outcome.status === "REJECTED" && outcome.code && change
        ? [{ entity: change.entity, id: change.key, code: outcome.code }]
        : [];
    });
    if (rejections.length > 0) {
      for (const rejection of rejections) options.onRejected?.(rejection);
      throw new NonRetriableError(`sync rejected: ${rejections.map((r) => r.code).join(", ")}`);
    }
  }

  /**
   * The Outbox store, with the status refreshed after each write. The
   * executor queues a change only after storing it, so that is when the
   * pending count moves.
   */
  function observed(storage: StorageAdapter): StorageAdapter {
    const refresh = () => {
      setTimeout(publish, 0);
    };
    return {
      get: (key) => storage.get(key),
      keys: () => storage.keys(),
      set: async (key, value) => {
        await storage.set(key, value);
        refresh();
      },
      delete: async (key) => {
        await storage.delete(key);
        refresh();
      },
      clear: async () => {
        await storage.clear();
        refresh();
      }
    };
  }

  const executor = startOfflineExecutor({
    collections: { todos, notes },
    mutationFns: { sync: push },
    // The executor runs one transaction at a time, oldest first, so a Todo
    // created for a new Note follows it (the offline order test proves it).
    // Offline, every error but a NonRetriableError is worth another try.
    shouldRetry: () => true,
    storage: observed(options.storage),
    ...(options.onlineDetector ? { onlineDetector: options.onlineDetector } : {}),
    ...(options.leaderElection ? { leaderElection: options.leaderElection } : {})
  });

  function computeStatus(): SyncStatus {
    const pending = executor.getPendingCount();
    const state = signedOut
      ? "signedOut"
      : !executor.isOnline()
        ? "offline"
        : pulling || pending > 0
          ? "syncing"
          : pullFailed
            ? "error"
            : "online";
    return { state, pending };
  }

  function publish(): void {
    if (disposed) return;
    const next = computeStatus();
    if (next.state === status.state && next.pending === status.pending) return;
    status = next;
    for (const listener of listeners) listener(status);
  }

  const initialized = executor.waitForInit();
  const ready = initialized
    .then(() => pull())
    .catch(() => undefined)
    .finally(() => {
      // Ready even when the first pull failed: offline, the Outbox's rows still show.
      todoTarget.handle?.markReady();
      noteTarget.handle?.markReady();
      publish();
    });

  const unsubscribeOnline = executor.getOnlineDetector().subscribe(() => {
    publish();
    if (executor.isOnline()) void pull().catch(() => undefined);
  });
  const interval = setInterval(() => {
    void pull().catch(() => undefined);
  }, options.pullIntervalMs ?? PULL_INTERVAL_MS);

  const createTodoAction = executor.createOfflineAction<SyncTodo>({
    mutationFnName: "sync",
    onMutate: (todo) => {
      todos.insert(todo);
    }
  });
  const updateTodoAction = executor.createOfflineAction<{ id: string; patch: SyncTodoPatch }>({
    mutationFnName: "sync",
    onMutate: ({ id, patch }) => {
      todos.update(id, (draft) => {
        Object.assign(draft, patch);
      });
    }
  });
  const deleteTodoAction = executor.createOfflineAction<string>({
    mutationFnName: "sync",
    onMutate: (id) => {
      todos.delete(id);
    }
  });
  const createNoteAction = executor.createOfflineAction<SyncNote>({
    mutationFnName: "sync",
    onMutate: (note) => {
      notes.insert(note);
    }
  });
  const updateNoteAction = executor.createOfflineAction<{ id: string; patch: SyncNotePatch }>({
    mutationFnName: "sync",
    onMutate: ({ id, patch }) => {
      notes.update(id, (draft) => {
        Object.assign(draft, patch);
      });
    }
  });
  const deleteNoteAction = executor.createOfflineAction<string>({
    mutationFnName: "sync",
    onMutate: (id) => {
      notes.delete(id);
    }
  });

  /** Runs a local change once the Outbox is loaded, and tracks its settling. */
  async function act(run: () => Transaction): Promise<void> {
    await initialized;
    const transaction = run();
    publish();
    transaction.isPersisted.promise.then(publish, publish);
  }

  return {
    todos,
    notes,
    ready,
    async createTodo({ title, description = null, noteId = null }) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await act(() =>
        createTodoAction({
          id,
          title,
          description,
          completed: false,
          noteId,
          attachments: [],
          createdAt: now,
          updatedAt: now
        })
      );
      return id;
    },
    updateTodo: (id, patch) => act(() => updateTodoAction({ id, patch })),
    deleteTodo: (id) => act(() => deleteTodoAction(id)),
    async createNote({ title, body = null }) {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await act(() => createNoteAction({ id, title, body, createdAt: now, updatedAt: now }));
      return id;
    },
    updateNote: (id, patch) => act(() => updateNoteAction({ id, patch })),
    deleteNote: (id) => act(() => deleteNoteAction(id)),
    pull,
    getStatus: () => status,
    subscribeStatus(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      clearInterval(interval);
      unsubscribeOnline();
      for (const subscription of keepAlive) subscription.unsubscribe();
      executor.dispose();
      listeners.clear();
      void todos.cleanup();
      void notes.cleanup();
    }
  };
}

/**
 * The browser's Outbox store and leader lock for one (User, Organization):
 * both names carry the pair, so tabs in different Organizations each lead
 * their own Outbox and never share one.
 */
export function browserSyncStores(scope: { userId: string; organizationId: string }): {
  storage: StorageAdapter;
  leaderElection: LeaderElection | undefined;
} {
  const name = `kaine-sync:${scope.userId}:${scope.organizationId}`;
  const leaderElection = WebLocksLeader.isSupported()
    ? new WebLocksLeader(name)
    : BroadcastChannelLeader.isSupported()
      ? new BroadcastChannelLeader(name)
      : undefined;
  return { storage: new IndexedDBAdapter(name, "outbox"), leaderElection };
}
