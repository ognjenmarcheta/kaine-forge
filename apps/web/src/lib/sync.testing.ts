import {
  createSyncEngine,
  type SyncEngine,
  type SyncMutation,
  type SyncNote,
  type SyncOlder,
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
  /** Rows of each list a first pull, or one older page, returns, newest first; unset returns every row. */
  window?: number;
}

export function createFakeSyncServer(): FakeSyncServer {
  return { todos: new Map(), notes: new Map(), pushed: [], deleted: [] };
}

const STAMP = "2026-09-13T12:00:00.000Z";
let created = 0;
/** A creation time later than every one before it, as the database's clock gives. */
function nextCreatedAt(): string {
  return new Date(Date.UTC(2026, 8, 14) + ++created * 1000).toISOString();
}

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
      createdAt: nextCreatedAt(),
      updatedAt: STAMP
    });
  } else if ("todoUpdate" in mutation) {
    const { id, ...patch } = mutation.todoUpdate;
    const row = server.todos.get(id);
    if (row) server.todos.set(id, { ...row, ...patch });
  } else if ("todoDelete" in mutation) {
    if (server.todos.delete(mutation.todoDelete.id))
      server.deleted.push({ entity: "TODO", id: mutation.todoDelete.id });
  } else if ("noteCreate" in mutation) {
    const { id, title, body } = mutation.noteCreate;
    server.notes.set(id, {
      id,
      title,
      body,
      createdAt: nextCreatedAt(),
      updatedAt: STAMP
    });
  } else if ("noteUpdate" in mutation) {
    const { id, title, body } = mutation.noteUpdate;
    const row = server.notes.get(id);
    if (row) {
      server.notes.set(id, {
        ...row,
        ...(title === undefined ? {} : { title }),
        ...(body === undefined ? {} : { body })
      });
    }
  } else if ("noteDelete" in mutation) {
    if (server.notes.delete(mutation.noteDelete.id))
      server.deleted.push({ entity: "NOTE", id: mutation.noteDelete.id });
  }
}

function newestFirst<TRow extends { createdAt: string }>(rows: Iterable<TRow>): TRow[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Each list's rows from `offset`, `window` of them, and where the rest continue. */
function listPage(server: FakeSyncServer, offset: number) {
  const size = server.window ?? Number.POSITIVE_INFINITY;
  const page = <TRow extends { createdAt: string }>(list: string, rows: Map<string, TRow>) => ({
    rows: newestFirst(rows.values()).slice(offset, offset + size),
    older: rows.size > offset + size ? [{ list, after: `${list}:${String(offset + size)}` }] : []
  });
  const todos = page("todos", server.todos);
  const notes = page("notes", server.notes);
  const older: SyncOlder[] = [...todos.older, ...notes.older];
  return { todos: todos.rows, notes: notes.rows, older };
}

/** A real sync engine over the fake server, with an in-memory Outbox and one leader tab. */
export function createTestSyncEngine(server: FakeSyncServer): SyncEngine {
  const store = new Map<string, string>();
  let version = 0;
  return createSyncEngine({
    transport: {
      pull: async (cursor) => {
        const first = cursor === null && server.window !== undefined;
        return {
          ...(first
            ? listPage(server, 0)
            : { todos: [...server.todos.values()], notes: [...server.notes.values()], older: [] }),
          deleted: server.deleted.splice(0),
          cursor: String(++version),
          hasMore: false,
          resetRequired: false
        };
      },
      pullOlder: async (after) => {
        const [list, offset] = after.split(":");
        const page = listPage(server, Number(offset));
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
