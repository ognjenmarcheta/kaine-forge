import {
  createCollection,
  type Collection,
  type PendingMutation,
  type SyncAppliedReceipt,
  type SyncConfig,
  type SyncMetadataApi,
  type Transaction
} from "@tanstack/db";
import {
  persistedCollectionOptions,
  type PersistedCollectionPersistence
} from "@tanstack/db-sqlite-persistence-core";
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
  SyncList,
  SyncRejection,
  SyncStatus,
  SyncTodo,
  SyncTodoPatch,
  SyncTransport
} from "./sync.type";
import { SyncAuthError, SyncRequestError, toSyncMutation, type SyncEntity } from "./sync.util";

/** How often a client pulls without a poke: realtime events reach one API process only. */
const PULL_INTERVAL_MS = 60_000;
/** Raise when a stored row's shape changes: older stored rows are then dropped and pulled again. */
const SYNC_SCHEMA_VERSION = 1;
/** The collection metadata key that keeps the pull cursor beside the stored rows. */
const CURSOR_KEY = "syncCursor";
/** Where a collection's older rows continue on the server, stored beside its rows. */
const OLDER_KEY = "syncOlder";
/** Rows of each list a first pull loads; older ones load on demand (issue #800). */
const SYNC_WINDOW = 500;
let engineCount = 0;

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
  /** A Pending Change the server refused; it rolls back right after this call. */
  onRejected?: (rejection: SyncRejection) => void;
  /**
   * Device storage for the synced rows, for the same User and Organization as
   * the Outbox. Without it the rows live in memory and every start pulls them all.
   */
  persistence?: PersistedCollectionPersistence;
}

export interface SyncEngine {
  /**
   * Unique per engine. A live query keys on it: collection ids repeat across
   * engines, and a mounted query must never reuse an id for another collection.
   */
  id: string;
  todos: Collection<SyncTodo, string>;
  notes: Collection<SyncNote, string>;
  /** Resolves once the Outbox is loaded and the first pull settled, whether or not it succeeded. */
  ready: Promise<void>;
  /*
   * Each write below shows at once and resolves once the Outbox stores it, so
   * a page that closes after that keeps the change. It never waits for the server.
   */
  /** Creates a Todo with a client id and returns the id. */
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
  /**
   * Loads the next older rows of a list from the server, for a list the
   * status names in `older`. It needs the network; it never runs beside a pull.
   */
  loadOlder: (list: SyncList) => Promise<void>;
  /** Drops this device's Pending Changes for the engine's scope, for a sign-out. */
  clearLocalData: () => Promise<void>;
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
  metadata?: SyncMetadataApi<string> | undefined;
}

/** One synced collection: its sync run's handle. */
interface SyncTarget<TRow extends { id: string }> {
  handle: SyncHandle<TRow> | null;
  /** Resolves when the collection starts its sync run, after stored rows load. */
  started: Promise<void>;
  start: () => void;
}

function syncTarget<TRow extends { id: string }>(): SyncTarget<TRow> {
  let start: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  return { handle: null, started, start };
}

/** A text value stored beside a collection's rows, such as its pull cursor. */
function storedText<TRow extends { id: string }>(
  target: SyncTarget<TRow>,
  key: string
): string | null {
  const value = target.handle?.metadata?.collection.get(key);
  return typeof value === "string" ? value : null;
}

/**
 * Writes one page's rows and deletions into a collection's synced state. It
 * never awaits the commit: during a push, sync commits wait for the push. A
 * stored collection also stores the page's cursor in the same commit, so its
 * rows and cursor never disagree.
 *
 * Every row is written as a full-row update, which inserts a row the synced
 * state lacks, and a deletion of a missing row does nothing. So rows loaded
 * from the device need no bookkeeping before a pull changes or deletes them.
 */
function applyRows<TRow extends { id: string }>(
  target: SyncTarget<TRow>,
  page: {
    values: TRow[];
    deletedIds: string[];
    cursor: string | null;
    /** Where older rows continue; null when none are left, undefined to keep what is stored. */
    older?: string | null;
  },
  { reset, stored }: { reset: boolean; stored: boolean }
): SyncAppliedReceipt | undefined {
  const { handle } = target;
  const { values, deletedIds, cursor, older } = page;
  if (!handle || (!reset && !stored && values.length === 0 && deletedIds.length === 0)) {
    return undefined;
  }

  handle.begin();
  if (reset) handle.truncate();
  for (const value of values) handle.write({ type: "update", value });
  for (const id of deletedIds) handle.write({ type: "delete", key: id });
  if (stored && cursor !== null) handle.metadata?.collection.set(CURSOR_KEY, cursor);
  if (stored && typeof older === "string") handle.metadata?.collection.set(OLDER_KEY, older);
  if (stored && older === null) handle.metadata?.collection.delete(OLDER_KEY);
  return handle.commit();
}

/**
 * Offline sync for one User in one Organization: Todo and Note collections
 * fed by `syncPull`, and an Outbox that replays local changes through
 * `syncPush` in order. Create one per (User, Organization) and dispose it on
 * a switch; the server scopes every request from the session regardless.
 */
export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { transport } = options;
  const stored = options.persistence !== undefined;
  const todoTarget = syncTarget<SyncTodo>();
  const noteTarget = syncTarget<SyncNote>();
  let cursor: string | null = null;
  let pulling = false;
  let pullFailed = false;
  // A reset the server asked for, kept until its full pull applies: a failed
  // pull in between must not lose it.
  let resetPending = false;
  let signedOut = false;
  let disposed = false;
  let status: SyncStatus = { state: "syncing", pending: 0, older: [] };
  // Where each list's older rows continue on the server; a list without older rows has none.
  const older = new Map<SyncList, string>();
  let loadingOlder: Promise<void> | null = null;
  const listeners = new Set<(status: SyncStatus) => void>();
  const id = `sync-engine:${String(++engineCount)}`;

  /**
   * A collection fed by the pull. Stored, its rows load from the device
   * before its sync run starts, and its pull cursor is stored beside them.
   */
  function synced<TRow extends { id: string }>(
    collectionId: string,
    target: SyncTarget<TRow>
  ): Collection<TRow, string> {
    const config = {
      id: collectionId,
      getKey: (row: TRow) => row.id,
      startSync: true,
      gcTime: 0,
      sync: {
        rowUpdateMode: "full" as const,
        sync: ({
          begin,
          write,
          commit,
          truncate,
          markReady,
          metadata
        }: Parameters<SyncConfig<TRow, string>["sync"]>[0]) => {
          target.handle = { begin, write, commit, truncate, markReady, metadata };
          target.start();
          return () => {
            target.handle = null;
          };
        }
      }
    };
    return options.persistence
      ? createCollection(
          persistedCollectionOptions<TRow, string>({
            ...config,
            persistence: options.persistence,
            schemaVersion: SYNC_SCHEMA_VERSION
          })
        )
      : createCollection<TRow, string>(config);
  }

  const todos = synced("todos", todoTarget);
  const notes = synced("notes", noteTarget);

  function entityOf(collectionId: string): SyncEntity {
    if (collectionId === todos.id) return "TODO";
    if (collectionId === notes.id) return "NOTE";
    throw new Error(`no synced entity for collection ${collectionId}`);
  }

  // A collection pauses its sync without subscribers; the engine stays its subscriber.
  const keepAlive = [
    todos.subscribeChanges(() => undefined),
    notes.subscribeChanges(() => undefined)
  ];

  /** A first pull names every list's older rows; a later page leaves them as they are. */
  function apply(page: SyncPullPage, reset: boolean, first: boolean): void {
    const deletedIds = (entity: SyncEntity) =>
      page.deleted.filter((deletion) => deletion.entity === entity).map((deletion) => deletion.id);
    const olderOf = (list: SyncList) => {
      if (!first) return {};
      const after = page.older.find((entry) => entry.list === list)?.after ?? null;
      if (after === null) older.delete(list);
      else older.set(list, after);
      return { older: after };
    };
    const mode = { reset, stored };
    // Never awaited: during a push, sync commits wait for the push.
    void applyRows(
      todoTarget,
      {
        values: page.todos,
        deletedIds: deletedIds("TODO"),
        cursor: page.cursor,
        ...olderOf("todos")
      },
      mode
    );
    void applyRows(
      noteTarget,
      {
        values: page.notes,
        deletedIds: deletedIds("NOTE"),
        cursor: page.cursor,
        ...olderOf("notes")
      },
      mode
    );
  }

  /**
   * Resumes from the cursor stored with the rows. Both collections store it in
   * their own commits; when they disagree (a stop between the two), or rows
   * were stored without one, the first pull rebuilds them in full.
   */
  async function restore(): Promise<void> {
    if (!stored) return;
    await Promise.all([todoTarget.started, noteTarget.started]);
    const todoCursor = storedText(todoTarget, CURSOR_KEY);
    if (todoCursor !== null && todoCursor === storedText(noteTarget, CURSOR_KEY)) {
      cursor = todoCursor;
      const restoreOlder = (list: SyncList, after: string | null) => {
        if (after !== null) older.set(list, after);
      };
      restoreOlder("todos", storedText(todoTarget, OLDER_KEY));
      restoreOlder("notes", storedText(noteTarget, OLDER_KEY));
      // The stored rows are the state at that cursor: show them before the pull.
      todoTarget.handle?.markReady();
      noteTarget.handle?.markReady();
      return;
    }
    resetPending = true;
  }

  async function drain(): Promise<void> {
    pulling = true;
    publish();
    try {
      // An older page that loads now must land before any later change.
      await loadingOlder?.catch(() => undefined);
      for (;;) {
        const first = cursor === null;
        const page = await transport.pull(cursor, first ? SYNC_WINDOW : undefined);
        if (disposed) return;
        if (page.resetRequired) {
          // The server cannot replay from here: rebuild from a full pull.
          cursor = null;
          resetPending = true;
          continue;
        }
        apply(page, resetPending, first);
        resetPending = false;
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
      changes: mutation.changes,
      original: mutation.original
    }));
    const mutations = changes.map(toSyncMutation);
    let outcomes;
    try {
      outcomes = await transport.push(idempotencyKey, mutations);
    } catch (error) {
      if (error instanceof SyncAuthError) {
        signedOut = true;
        publish();
      }
      // Resending a refused request cannot succeed; anything else retries.
      if (error instanceof SyncRequestError) {
        changes.forEach((change, index) => {
          const sent = mutations[index];
          if (sent) {
            options.onRejected?.({
              entity: change.entity,
              id: change.key,
              code: "INVALID",
              change: sent
            });
          }
        });
        throw new NonRetriableError(error.message);
      }
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
      const sent = mutations[index];
      return outcome.status === "REJECTED" && outcome.code && change && sent
        ? [{ entity: change.entity, id: change.key, code: outcome.code, change: sent }]
        : [];
    });
    if (rejections.length > 0) {
      for (const rejection of rejections) options.onRejected?.(rejection);
      throw new NonRetriableError(`sync rejected: ${rejections.map((r) => r.code).join(", ")}`);
    }
  }

  /** Local changes waiting for their Outbox entry, by transaction id. */
  const storing = new Map<string, () => void>();

  /**
   * The Outbox store, with the status refreshed after each write. The
   * executor queues a change only after storing it, so that is when the
   * pending count moves, and when a waiting change is safe on the device.
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
        for (const [transactionId, stored] of storing) {
          if (key.endsWith(transactionId)) stored();
        }
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
    return { state, pending, older: [...older.keys()].sort() };
  }

  function publish(): void {
    if (disposed) return;
    const next = computeStatus();
    if (
      next.state === status.state &&
      next.pending === status.pending &&
      next.older.join() === status.older.join()
    ) {
      return;
    }
    status = next;
    for (const listener of listeners) listener(status);
  }

  const initialized = Promise.all([executor.waitForInit(), restore()]).then(() => undefined);
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

  /**
   * Runs a local change once the Outbox is loaded, and resolves once the
   * Outbox stores it: a page that closes after that keeps the change. A tab
   * that does not lead the Outbox stores nothing, so it resolves at once.
   */
  async function act(run: () => Transaction): Promise<void> {
    await initialized;
    const transaction = run();
    publish();
    const settled = transaction.when("settled");
    settled.then(publish, publish);
    if (!executor.isOfflineEnabled) return;
    try {
      await Promise.race([
        new Promise<void>((resolve) => storing.set(transaction.id, resolve)),
        // A change the Outbox refuses settles without being stored.
        settled.then(
          () => undefined,
          () => undefined
        )
      ]);
    } finally {
      storing.delete(transaction.id);
    }
  }

  return {
    id,
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
    async loadOlder(list) {
      // Never beside a pull: a row deleted while the page loads must not come back.
      while (running || loadingOlder) await (running ?? loadingOlder)?.catch(() => undefined);
      const after = older.get(list);
      if (!after || disposed) return;
      let applied: SyncAppliedReceipt | undefined;
      loadingOlder = (async () => {
        const page = await transport.pullOlder(after);
        if (disposed) return;
        const next = page.older.find((entry) => entry.list === list)?.after ?? null;
        const rows = { deletedIds: [], cursor: null, older: next };
        const mode = { reset: false, stored };
        applied =
          list === "todos"
            ? applyRows(todoTarget, { ...rows, values: page.todos }, mode)
            : applyRows(noteTarget, { ...rows, values: page.notes }, mode);
        if (next === null) older.delete(list);
        else older.set(list, next);
        publish();
      })().finally(() => {
        loadingOlder = null;
      });
      await loadingOlder;
      // Outside the load: a commit during a push waits for it, and that push may wait for a pull.
      await applied;
      // Deletions made while the page loaded follow from the cursor.
      void pull().catch(() => undefined);
    },
    async clearLocalData() {
      await initialized;
      await executor.clearOutbox();
      publish();
    },
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
      // A screen may still read the old engine's rows during an Organization
      // switch; its live query rebuilds against the new engine.
      void todos.cleanup({ dependents: true });
      void notes.cleanup({ dependents: true });
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
  const name = `${browserSyncStorePrefix(scope.userId)}${scope.organizationId}`;
  const leaderElection = WebLocksLeader.isSupported()
    ? new WebLocksLeader(name)
    : BroadcastChannelLeader.isSupported()
      ? new BroadcastChannelLeader(name)
      : undefined;
  return { storage: new IndexedDBAdapter(name, "outbox"), leaderElection };
}

/** The start of every browser store name of a User, in any Organization. */
export function browserSyncStorePrefix(userId: string): string {
  return `kaine-sync:${userId}:`;
}
