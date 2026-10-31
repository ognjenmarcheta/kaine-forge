import {
  createSyncEngine,
  type SyncEngine,
  type SyncMutation,
  type SyncNote,
  type SyncTodo
} from "@repo/sync";

/**
 * A fake API for hook tests: its rows, every pushed mutation, and the ids it
 * deleted. Each pull returns every row, plus the deletions since the last one.
 */
export interface FakeSyncServer {
  todos: Map<string, SyncTodo>;
  notes: Map<string, SyncNote>;
  pushed: SyncMutation[][];
  /** Ids removed from `todos` or `notes`, reported by the next pull. */
  deleted: Array<{ entity: "TODO" | "NOTE"; id: string }>;
}

export function createFakeSyncServer(): FakeSyncServer {
  return { todos: new Map(), notes: new Map(), pushed: [], deleted: [] };
}

const STAMP = "2026-09-13T12:00:00.000Z";

function apply(server: FakeSyncServer, mutation: SyncMutation): void {
  if ("todoCreate" in mutation) {
    const { id, title, description, noteId } = mutation.todoCreate;
    server.todos.set(id, {
      id,
      title,
      description,
      completed: false,
      noteId,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: STAMP
    });
  } else if ("todoUpdate" in mutation) {
    const { id, ...patch } = mutation.todoUpdate;
    const row = server.todos.get(id);
    if (row) server.todos.set(id, { ...row, ...patch });
  } else if ("todoDelete" in mutation) {
    server.todos.delete(mutation.todoDelete.id);
  } else if ("noteCreate" in mutation) {
    const { id, title, body } = mutation.noteCreate;
    server.notes.set(id, {
      id,
      title,
      body,
      createdAt: new Date().toISOString(),
      updatedAt: STAMP
    });
  } else if ("noteUpdate" in mutation) {
    const { id, ...patch } = mutation.noteUpdate;
    const row = server.notes.get(id);
    if (row) server.notes.set(id, { ...row, ...patch });
  } else if ("noteDelete" in mutation) {
    server.notes.delete(mutation.noteDelete.id);
  }
}

/** A real sync engine over the fake server, with an in-memory Outbox and one leader tab. */
export function createTestSyncEngine(server: FakeSyncServer): SyncEngine {
  const store = new Map<string, string>();
  let version = 0;
  return createSyncEngine({
    transport: {
      pull: async () => ({
        todos: [...server.todos.values()],
        notes: [...server.notes.values()],
        deleted: server.deleted.splice(0),
        cursor: String(++version),
        hasMore: false,
        resetRequired: false
      }),
      push: async (_key, mutations) => {
        server.pushed.push(mutations);
        for (const mutation of mutations) apply(server, mutation);
        return mutations.map(() => ({ status: "APPLIED" as const, code: null }));
      }
    },
    storage: {
      get: async (key) => store.get(key) ?? null,
      set: async (key, value) => void store.set(key, value),
      delete: async (key) => void store.delete(key),
      keys: async () => [...store.keys()],
      clear: async () => store.clear()
    },
    leaderElection: {
      requestLeadership: async () => true,
      releaseLeadership: () => undefined,
      isLeader: () => true,
      onLeadershipChange: () => () => undefined
    }
  });
}
